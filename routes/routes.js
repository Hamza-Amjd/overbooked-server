require('dotenv').config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();
const multer = require('multer');
const fs = require('fs');
const OpenAI = require('openai');
const fetch = require('node-fetch');
const adminAuth = require('../middleware/adminAuth');

// Import required models and controllers
const User = require("../models/userModel");
const Library = require("../models/libraryModel");
const authenticationController = require("../controllers/authenticationController");
const oauth = require("../controllers/oauth");
const Notification = require("../models/notificationModel");
const BookRequest = require("../models/bookRequestModel");

// Basic CORS setup
app.use(cors({
  origin: 'http://localhost:5173', // Your frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine destination based on file type
    const dest = file.fieldname === 'pdf' ? 'uploads/pdfs' : 'uploads/covers';
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    // Create unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Authentication Routes
app.get("/", authenticationController.getWelcome);
app.get("/login", authenticationController.getLogin);
app.post("/login", authenticationController.postLogin);
app.get("/register", authenticationController.getRegister);
app.post("/register", authenticationController.postRegister);
app.post("/oauth/login", oauth.googlesignin);


// Library Routes
app.get("/library", async (req, res) => {
    try {
        const books = await Library.find({}, {
            bookName: 1,
            author: 1,
            cover: 1,
            rating: 1,
            available: 1,
            issued: 1,
            requests: 1,
            pdf: 1,
            readCount: 1,
            category: 1
        }).lean();
        res.json(books);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Issue Book Routes (supporting multiple endpoints)
app.post("/library/issue-book", handleIssueBook);
app.post("/library/issueBook", handleIssueBook);
app.post("/library/requestBook/:bookID", handleIssueBook);

// Issue Book Handler
async function handleIssueBook(req, res) {
    try {
    const bookID = req.params.bookID || req.body.bookID;
    const userID = req.body.userID;
        
    // Validate inputs
        if (!bookID || !userID) {
      return res.status(400).json({ 
        error: "Book ID and User ID are required" 
      });
    }

    // Find the book and user
    const [book, user] = await Promise.all([
      Library.findById(bookID),
      User.findById(userID)
    ]);

    // Validations
        if (!book) {
            return res.status(404).json({ error: "Book not found" });
        }
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
        if (book.available <= 0) {
            return res.status(400).json({ error: "Book is not available" });
        }

    // Check if user already has a pending or approved request
        const existingRequest = book.requests.find(
            req => req.userID.toString() === userID && 
            ['pending', 'approved'].includes(req.status)
        );

        if (existingRequest) {
            return res.status(400).json({ 
                error: `You already have a ${existingRequest.status} request for this book` 
            });
        }

        // Add new request
    book.requests.push({
            userID,
      userName: user.username,
      status: 'pending',
            requestDate: new Date()
    });

        await book.save();

        res.json({ 
            success: true,
            message: "Request submitted successfully",
            book: {
                _id: book._id,
                bookName: book.bookName,
                available: book.available,
                requests: book.requests
            }
        });

    } catch (error) {
    console.error("Error submitting request:", error);
        res.status(500).json({ 
            error: "Failed to submit request",
            details: error.message 
        });
    }
}

// Return Book Routes
app.post("/library/returnBook", async (req, res) => {
    try {
    const { bookID, userID, returnBookName } = req.body;

    // Find the book and user
    const [book, user] = await Promise.all([
      Library.findById(bookID),
      User.findById(userID)
    ]);

    // Validate book and user
    if (!book) {
            return res.status(404).json({ error: "Book not found" });
        }
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if user has actually issued this book
    const hasIssuedBook = user.issuedBooks.some(
      issuedBook => issuedBook.bookID.toString() === bookID
    );

    if (!hasIssuedBook) {
      return res.status(400).json({ error: "This book was not issued to you" });
    }

    // Update book availability
    book.available += 1;
    book.issued = Math.max(0, book.issued - 1);

    // Remove book from user's issued books
    user.issuedBooks = user.issuedBooks.filter(
      issuedBook => issuedBook.bookID.toString() !== bookID
    );

    // Update request status if exists
    const request = book.requests.find(
      req => req.userID.toString() === userID && req.status === 'approved'
    );
    
    if (request) {
      // Instead of setting status to 'returned', remove the request
      book.requests = book.requests.filter(
        req => !(req.userID.toString() === userID && req.status === 'approved')
      );
    }

    // Save both updates
    await Promise.all([book.save(), user.save()]);

        res.json({
            success: true,
            message: "Book returned successfully",
      book: {
        _id: book._id,
        bookName: book.bookName,
        available: book.available,
        issued: book.issued
      },
      user: {
        _id: user._id,
        issuedBooks: user.issuedBooks
      }
    });

    } catch (error) {
        console.error("Error returning book:", error);
    res.status(500).json({ 
      error: "Failed to return book",
      details: error.message 
    });
    }
});

// Admin Routes
app.post("/admin/pending-requests", async (req, res) => {
    try {
        const books = await Library.find({
      'requests.status': 'pending'
    }).populate('requests.userID', 'username email'); // Populate user details

    // Format the response to match your AdminPanel expectations
    const formattedBooks = books.map(book => ({
            _id: book._id,
            bookName: book.bookName,
            cover: book.cover,
            available: book.available,
            requests: book.requests
        .filter(req => req.status === 'pending')
                .map(req => ({
                    _id: req._id,
          requestDate: req.requestDate,
                    user: {
                        _id: req.userID._id,
                        username: req.userID.username,
                        email: req.userID.email
          }
                }))
    }));

    res.json(formattedBooks);
    } catch (error) {
        console.error("Error fetching pending requests:", error);
        res.status(500).json({ error: "Failed to fetch pending requests" });
    }
});

app.post("/admin/handle-request", async (req, res) => {
    try {
        const { bookID, requestID, userID, status } = req.body;

    const book = await Library.findById(bookID);
        if (!book) {
            return res.status(404).json({ error: "Book not found" });
        }

    // Find the specific request
        const request = book.requests.id(requestID);
        if (!request) {
            return res.status(404).json({ error: "Request not found" });
        }

        if (status === "approved") {
      if (book.available <= 0) {
        return res.status(400).json({ error: "Book is no longer available" });
      }

            // Update book availability
      book.available -= 1;
      book.issued += 1;

      // Update user's issued books
      const user = await User.findById(userID);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const issueDate = new Date();
      const returnDate = new Date(issueDate);
      returnDate.setDate(returnDate.getDate() + 14); // Add 14 days

      user.issuedBooks.push({
                bookID: book._id,
                bookName: book.bookName,
        issueDate: issueDate,
        returnDate: returnDate
      });

      await user.save();
    }

    // Update request status
    request.status = status;
    await book.save();

        res.json({ 
            success: true,
            message: `Request ${status} successfully`,
      book
        });

    } catch (error) {
        console.error("Error handling request:", error);
    res.status(500).json({ error: "Failed to handle request" });
    }
});

// Signout/Logout routes
app.post("/library/signout", (req, res) => {
    res.json({ message: "Logged out successfully" });
});

app.post("/logout", (req, res) => {
    res.json({ message: "Logged out successfully" });
});

// Add this route for fetching issued books
app.get("/library/issued-books/:userID", async (req, res) => {
    try {
        const { userID } = req.params;
    
    // Validate userID
    if (!userID) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Find user and populate issued books with book details
    const user = await User.findById(userID);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

    // Get full book details for each issued book
    const issuedBooksDetails = await Promise.all(
      user.issuedBooks.map(async (issuedBook) => {
        const book = await Library.findById(issuedBook.bookID);
        return {
          ...issuedBook.toObject(),
          bookDetails: book ? {
            bookName: book.bookName,
            author: book.author,
            cover: book.cover,
            category: book.category,
            rating: book.rating,
            pdf: book.pdf
          } : null
        };
      })
    );

    res.json(issuedBooksDetails);
    } catch (error) {
        console.error("Error fetching issued books:", error);
    res.status(500).json({ error: "Failed to fetch issued books" });
    }
});

// Statistics Routes
app.get("/statistics/:userID", async (req, res) => {
    try {
        const user = await User.findById(req.params.userID);
        const issuedBooks = user.issuedBooks;

        res.json({
            totalBooksRead: issuedBooks.length,
            readingHistory: issuedBooks.map(book => ({
                bookName: book.bookName,
                issueDate: book.issueDate
            }))
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch statistics" });
    }
});

// Route to serve PDF files
app.get("/library/book/:bookID/pdf", async (req, res) => {
    try {
        const book = await Library.findById(req.params.bookID);
        if (!book || !book.pdf) {
            return res.status(404).json({ error: "PDF not found" });
        }

        const pdfPath = book.pdf.startsWith('/') ? book.pdf.slice(1) : book.pdf;
        const absolutePdfPath = path.join(__dirname, '..', pdfPath);

        if (!fs.existsSync(absolutePdfPath)) {
            return res.status(404).json({ error: "PDF file not found" });
        }

        // Simple headers for PDF serving
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${book.bookName}.pdf"`);

        // Stream the file
        const fileStream = fs.createReadStream(absolutePdfPath);
        fileStream.pipe(res);
    } catch (error) {
        console.error("Error serving PDF:", error);
        res.status(500).json({ error: "Failed to serve PDF" });
    }
});

// Route to update reading progress
app.post("/library/book/:bookID/progress", async (req, res) => {
    try {
        const { bookID } = req.params;
        const { userID } = req.body;

        const book = await Library.findById(bookID);
        if (!book) {
            return res.status(404).json({ error: "Book not found" });
        }

        // Increment read count if this is the first time user is reading
        const user = await User.findById(userID);
        const hasRead = user.issuedBooks.some(b => 
            b.bookID.toString() === bookID && b.hasRead
        );

        if (!hasRead) {
            book.readCount += 1;
            await book.save();

            // Update user's issued books to mark as read
            await User.updateOne(
                { 
                    _id: userID,
                    "issuedBooks.bookID": bookID 
                },
                { 
                    $set: { "issuedBooks.$.hasRead": true }
                }
            );
        }

        res.json({ success: true, readCount: book.readCount });
    } catch (error) {
        console.error("Error updating reading progress:", error);
        res.status(500).json({ error: "Failed to update reading progress" });
    }
});

// Add this route after your existing routes
app.post("/library/add-book", upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'pdf', maxCount: 1 }
]), async (req, res) => {
  try {
    const { bookName, author, rating, coverLink, available, total, category } = req.body;

    // Create new book document
    const newBook = new Library({
      bookName,
      author,
      category,
      rating: Number(rating) || 0,
      available: Number(available) || 5,
      total: Number(total) || 5,
      issued: 0,
      cover: coverLink || (req.files?.cover ? `/uploads/covers/${req.files.cover[0].filename}` : null),
      pdf: req.files?.pdf ? `/uploads/pdfs/${req.files.pdf[0].filename}` : null
    });

    await newBook.save();

    // Create notification for all users
    const users = await User.find({}, '_id');
    const notifications = users.map(user => ({
      userId: user._id,
      type: 'NEW_BOOK',
      message: `New book added: "${bookName}" by ${author}`,
      bookId: newBook._id,
      read: false
    }));

    await Notification.insertMany(notifications);

    res.status(201).json({ message: 'Book added successfully', book: newBook });
  } catch (error) {
    console.error("Error adding book:", error);
    res.status(500).json({ error: "Failed to add book" });
  }
});

// Add this to your routes
app.post("/library/reading-progress", async (req, res) => {
  try {
    const { userId, bookId, pageNumber } = req.body;
    console.log('Received progress:', { userId, bookId, pageNumber });

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update using findByIdAndUpdate to ensure atomic operation
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        $set: { [`readingProgress.${bookId}`]: pageNumber }
      },
      { new: true }
    );

    console.log('Updated reading progress:', updatedUser.readingProgress);
    res.json({ 
      success: true, 
      pageNumber,
      readingProgress: updatedUser.readingProgress 
    });
  } catch (error) {
    console.error("Error saving reading progress:", error);
    res.status(500).json({ error: "Failed to save reading progress" });
  }
});

// Get reading progress
app.get("/library/reading-progress/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    console.log('Fetched reading progress:', user.readingProgress);
    res.json({ readingProgress: user.readingProgress || {} });
  } catch (error) {
    console.error("Error fetching reading progress:", error);
    res.status(500).json({ error: "Failed to fetch reading progress" });
  }
});

// Get all categories with counts
app.get("/library/categories", async (req, res) => {
  try {
    const books = await Library.find();
    const categoryCounts = {};
    
    books.forEach(book => {
      if (book.category) {
        categoryCounts[book.category] = (categoryCounts[book.category] || 0) + 1;
      }
    });

    const categories = Object.entries(categoryCounts).map(([name, count]) => ({
      name,
      count
    }));

    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// Get all authors with book counts
app.get("/library/authors", async (req, res) => {
  try {
    const books = await Library.find();
    const authorCounts = {};
    
    books.forEach(book => {
      if (book.author) {
        authorCounts[book.author] = (authorCounts[book.author] || 0) + 1;
      }
    });

    const authors = Object.entries(authorCounts)
      .map(([name, bookCount]) => ({
        name,
        bookCount
      }))
      .sort((a, b) => b.bookCount - a.bookCount);

    res.json(authors);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch authors" });
  }
});

// Add this route to handle book deletion
app.delete("/library/book/:bookID", async (req, res) => {
  try {
    const { bookID } = req.params;
    const { user } = req.body;
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: "Access denied. Admin privileges required." });
    }
    
    const book = await Library.findById(bookID);
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    // Create notification for all users about book deletion
    const users = await User.find({}, '_id');
    const notifications = users.map(u => ({
      userId: u._id,
      type: 'BOOK_DELETED',
      message: `Book "${book.bookName}" by ${book.author} has been removed from the library`,
      read: false
    }));

    await Notification.insertMany(notifications);

    // Delete associated files if they exist
    if (book.pdf) {
      const pdfPath = path.join(__dirname, '..', book.pdf);
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    }
    
    if (book.cover) {
      const coverPath = path.join(__dirname, '..', book.cover);
      if (fs.existsSync(coverPath)) {
        fs.unlinkSync(coverPath);
      }
    }

    // Delete the book from database
    await Library.findByIdAndDelete(bookID);
    
    res.json({ 
      success: true, 
      message: "Book deleted successfully",
      deletedBookId: bookID 
    });
  } catch (error) {
    console.error("Error deleting book:", error);
    res.status(500).json({ error: "Failed to delete book" });
  }
});

// Add route for admin to handle requests
app.post("/library/handle-request", async (req, res) => {
  try {
    const { bookID, userID, status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const book = await Library.findById(bookID);
    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    const request = book.requests.find(
      req => req.userID.toString() === userID && req.status === 'pending'
    );

    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (status === 'approved') {
      if (book.available <= 0) {
        return res.status(400).json({ error: "Book is no longer available" });
      }

      // Update book availability
      book.available -= 1;
      book.issued += 1;

      // Update user's issued books
      const user = await User.findById(userID);
      user.issuedBooks.push({
        bookID: book._id,
        bookName: book.bookName,
        issueDate: new Date(),
        returnDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      });

      await user.save();
    }

    // Update request status
    request.status = status;
    await book.save();

    res.json({
      success: true,
      message: `Request ${status}`,
      book
    });

  } catch (error) {
    console.error("Error handling request:", error);
    res.status(500).json({ error: "Failed to handle request" });
  }
});

// Add route to get pending requests for admin
app.get("/library/pending-requests", async (req, res) => {
  try {
    const books = await Library.find({
      'requests.status': 'pending'
    });

    const pendingRequests = books.flatMap(book => 
      book.requests
        .filter(req => req.status === 'pending')
        .map(req => ({
          bookID: book._id,
          bookName: book.bookName,
          userID: req.userID,
          userName: req.userName,
          requestDate: req.requestDate
        }))
    );

    res.json(pendingRequests);
  } catch (error) {
    console.error("Error fetching pending requests:", error);
    res.status(500).json({ error: "Failed to fetch pending requests" });
  }
});

// Add this function at the top of your file
async function searchGoogleBooks(query) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3`
    );
    const data = await response.json();
    
    if (data.items) {
      return data.items.map(book => ({
        title: book.volumeInfo.title,
        author: book.volumeInfo.authors ? book.volumeInfo.authors.join(', ') : 'Unknown',
        category: book.volumeInfo.categories ? book.volumeInfo.categories[0] : 'Uncategorized',
        description: book.volumeInfo.description 
          ? book.volumeInfo.description.substring(0, 200) + '...'
          : 'No description available'
      }));
    }
    return [];
  } catch (error) {
    console.error('Google Books API Error:', error);
    return [];
  }
}

// Update the chat route
app.post("/library/chat", async (req, res) => {
  try {
    const { message, books } = req.body;

    // Create context from local library
    const libraryContext = books.map(book => 
      `"${book.bookName}" by ${book.author} (${book.category}) - ${book.available} copies available`
    ).join('\n');

    // Search Google Books if the message seems like a book search
    let webResults = '';
    if (message.toLowerCase().includes('find') || 
        message.toLowerCase().includes('search') || 
        message.toLowerCase().includes('looking for')) {
      const webBooks = await searchGoogleBooks(message);
      if (webBooks.length > 0) {
        webResults = '\n\nI also found these books online:\n' + webBooks.map(book =>
          `- "${book.title}" by ${book.author}\n  Category: ${book.category}\n  ${book.description}`
        ).join('\n\n');
      }
    }

    const MISTRAL_API_KEY = 'lmQD2YT2iLpPNjNTl2pMRdJavO1MevCg';
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: "mistral-tiny",
        messages: [
          {
            role: "system",
            content: `You are a helpful library assistant. If a book isn't available in the library, suggest similar books or recommend books from web search results. Always be friendly and use emojis where appropriate.`
          },
          {
            role: "user",
            content: `Here are the books in our library:\n${libraryContext}${webResults}\n\nUser question: ${message}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Mistral API Error Details:', {
        status: response.status,
        statusText: response.statusText,
        errorData
      });
      throw new Error('Failed to get response from AI');
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from AI');
    }

    res.json({ response: data.choices[0].message.content });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ 
      error: "Our library assistant is taking a break. Please try again in a moment.",
      details: error.message 
    });
  }
});

// Add this temporarily to check if the key is loaded
console.log('API Key:', process.env.MISTRAL_API_KEY);

// Add these new routes for notifications
app.get("/notifications/:userId", async (req, res) => {
  try {
    const notifications = await Notification.find({ 
      userId: req.params.userId 
    }).sort({ createdAt: -1 }).limit(50);
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

app.post("/notifications/:userId/clear", async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.params.userId },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear notifications" });
  }
});

app.post("/notifications/:notificationId/read", async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.notificationId,
      { read: true },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ 
      success: true, 
      notification 
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// Add this to your routes
app.post("/library/request-new-book", async (req, res) => {
  try {
    const { userId, userName, bookName, author, description } = req.body;
    
    const newRequest = new BookRequest({
      userId,
      userName,
      bookName,
      author,
      description,
      status: 'pending',
      requestDate: new Date()
    });

    await newRequest.save();

    // Create notification for admins
    const admins = await User.find({ isAdmin: true }, '_id');
    const notifications = admins.map(admin => ({
      userId: admin._id,
      type: 'BOOK_REQUEST',
      message: `New book request: "${bookName}" by ${author}`,
      read: false
    }));

    await Notification.insertMany(notifications);

    res.status(201).json({ message: 'Request submitted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

app.get("/library/book-requests", async (req, res) => {
  try {
    const requests = await BookRequest.find({ status: 'pending' })
      .sort({ requestDate: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

app.put("/library/book-requests/:requestId", async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;

    const request = await BookRequest.findByIdAndUpdate(
      requestId,
      { status },
      { new: true }
    );

    // Notify the user who requested the book
    const notification = new Notification({
      userId: request.userId,
      type: 'BOOK_REQUEST_UPDATE',
      message: `Your request for "${request.bookName}" has been ${status}`,
      read: false
    });

    await notification.save();

    res.json({ success: true, request });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update request' });
  }
});

module.exports = app;
