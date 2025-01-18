const multer = require('multer');
const path = require('path');
const Library = require("../models/libraryModel.js");
const User = require("../models/userModel.js");
const fs = require('fs');

// Multer setup for PDF upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Create uploads/pdfs directory if it doesn't exist
        const dir = 'uploads/pdfs';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true); // Accept PDF files
    } else {
        cb(new Error('Not a PDF file!'), false); // Reject non-PDF files
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

// GET - library homepage (returns JSON)
exports.getLibrary = async (req, res) => {
    try {
        const foundBooks = await Library.find({}); // Get all books in the library
        res.json(foundBooks.reverse()); // Return books as JSON, reversed for most recent first
    } catch (err) {
        res.status(500).json({ error: 'Unable to fetch books from the database' });
    }
};

// POST - sign out from the library
exports.postSignout = async (req, res) => {
    try {
        const { userID } = req.body;
        const foundUser = await User.findById(userID);
        if (!foundUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        foundUser.signedIn = false;
        await foundUser.save();
        
        res.status(200).json({ 
            success: true,
            message: 'User signed out successfully' 
        });
    } catch (err) {
        console.error('Signout error:', err);
        res.status(500).json({ 
            success: false,
            error: 'An error occurred during signout' 
        });
    }
};

// POST - issue a book from the library
exports.postIssueBook = async (req, res) => {
    try {
        const { userID } = req.body;
        const bookID = req.params.bookID;

        // Find the user
        const foundUser = await User.findById(userID);
        if (!foundUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Find the book
        const libraryBook = await Library.findById(bookID);
        if (!libraryBook) {
            return res.status(404).json({ error: 'Book not found in the library' });
        }

        // Check if user already has this book
        const hasBook = foundUser.issuedBooks.some(book => book.bookID.toString() === bookID);
        if (hasBook) {
            return res.status(400).json({ error: 'Book already issued to this user' });
        }

        // Check if book is available
        if (libraryBook.available <= 0) {
            return res.status(400).json({ error: 'Book is not available' });
        }

        // Update the available and issued counts in the library
        libraryBook.available -= 1;
        libraryBook.issued += 1;
        await libraryBook.save();

        // Add the book to the user's issuedBooks array
        foundUser.issuedBooks.push({
            bookName: libraryBook.bookName,
            cover: libraryBook.cover,
            pdf: libraryBook.pdf,
            bookID: libraryBook._id,
            rating: libraryBook.rating,
            available: libraryBook.available,
            issued: libraryBook.issued
        });
        await foundUser.save();

        // Return both updated book and updated user
        res.json({ 
            success: true,
            message: 'Book issued successfully',
            book: libraryBook,
            user: foundUser
        });
    } catch (err) {
        console.error('Error issuing book:', err);
        res.status(500).json({ error: 'An error occurred while issuing the book' });
    }
};

// POST - return books to the library
exports.postReturnBook = async (req, res) => {
    try {
        const { userID, bookID, returnBookName } = req.body;
        
        // Find the user
        const foundUser = await User.findById(userID);
        if (!foundUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Find the book in user's issued books
        const bookIndex = foundUser.issuedBooks.findIndex(book => book.bookID.toString() === bookID);
        if (bookIndex === -1) {
            return res.status(404).json({ error: 'Book not found in user\'s issued books' });
        }

        // Remove book from user's issued books
        foundUser.issuedBooks.splice(bookIndex, 1);
        await foundUser.save();

        // Update library book counts
        const foundBook = await Library.findById(bookID);
        if (!foundBook) {
            return res.status(404).json({ error: 'Book not found in the library' });
        }

        foundBook.issued -= 1;
        foundBook.available += 1;
        await foundBook.save();

        res.json({ 
            success: true,
            message: 'Book returned successfully',
            book: foundBook,
            user: foundUser
        });
    } catch (err) {
        console.error('Error returning book:', err);
        res.status(500).json({ 
            success: false,
            error: 'An error occurred while returning the book' 
        });
    }
};

// GET - new books to the library (returns JSON)
exports.getNewBook = async (req, res) => {
    try {
        const { userID } = req.body; // Get userID from the request body
        const foundUser = await User.findOne({ _id: userID });
        if (!foundUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: foundUser });
    } catch (err) {
        res.status(500).json({ error: 'An error occurred while fetching the user' });
    }
};

// POST - add new books to the library (with PDF upload)
exports.postNewBook = async (req, res) => {
    try {
        upload.single('pdf')(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: `Error uploading file: ${err.message}` });
            }

            const existingBook = await Library.findOne({ bookName: req.body.newBookName });
            if (existingBook) {
                return res.status(400).json({ error: 'This book already exists in the library' });
            }

            // Create the full URL for PDF access
            const pdfUrl = req.file ? 
                `http://localhost:5000/uploads/pdfs/${req.file.filename}` : null;

            const newBook = new Library({
                bookName: req.body.newBookName,
                issued: 0,
                available: 5,
                total: 5,
                cover: req.body.newBookCover || "https://source.unsplash.com/random",
                rating: req.body.newBookRating,
                pdf: pdfUrl,
            });

            await newBook.save();
            res.json({ message: 'New book added successfully', book: newBook });
        });
    } catch (err) {
        res.status(500).json({ error: 'An error occurred while adding the new book' });
    }
};

// POST - delete a book from the library
exports.postDeleteBook = async (req, res) => {
    const { bookID } = req.body; // Get bookID from the request body

    try {
        const deletedBook = await Library.findByIdAndDelete(bookID);
        if (!deletedBook) {
            return res.status(404).json({ error: 'Book not found' });
        }

        // Remove the book from users' issuedBooks
        await User.updateMany(
            { "issuedBooks.bookID": bookID },
            { $pull: { issuedBooks: { bookID: bookID } } }
        );

        res.json({ message: 'Book deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'An error occurred while deleting the book' });
    }
};

// Add this method to your existing controller
exports.getBookPDF = async (req, res) => {
    try {
        const book = await Library.findById(req.params.bookID);
        if (!book || !book.pdf) {
            return res.status(404).json({ message: "PDF not found" });
        }

        // Get the filename from the PDF URL
        const filename = book.pdf.split('/').pop();
        const pdfPath = path.join(__dirname, '../uploads/pdfs', filename);

        if (!fs.existsSync(pdfPath)) {
            return res.status(404).json({ message: "PDF file not found" });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

        const fileStream = fs.createReadStream(pdfPath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Error serving PDF:', error);
        res.status(500).json({ message: "Error serving PDF file" });
    }
};

// New function to handle book requests
exports.postRequestBook = async (req, res) => {
    try {
        const { userID } = req.body;
        const bookID = req.params.bookID;

        const foundUser = await User.findById(userID);
        if (!foundUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const libraryBook = await Library.findById(bookID);
        if (!libraryBook) {
            return res.status(404).json({ error: 'Book not found' });
        }

        // Check if user already has a pending request
        const existingRequest = libraryBook.requests.find(
            request => request.userID.toString() === userID && request.status === 'pending'
        );

        if (existingRequest) {
            return res.status(400).json({ error: 'You already have a pending request for this book' });
        }

        // Add new request
        libraryBook.requests.push({
            userID: userID,
            status: 'pending'
        });

        await libraryBook.save();

        res.json({
            success: true,
            message: 'Book request submitted successfully'
        });
    } catch (err) {
        console.error('Error requesting book:', err);
        res.status(500).json({ error: 'An error occurred while requesting the book' });
    }
};

// New function to get pending requests (admin only)
exports.getPendingRequests = async (req, res) => {
    try {
        const books = await Library.find({
            'requests.status': 'pending'
        }).populate('requests.userID', 'username email');

        const pendingRequests = books.flatMap(book => 
            book.requests
                .filter(request => request.status === 'pending')
                .map(request => ({
                    _id: request._id,
                    book: {
                        _id: book._id,
                        bookName: book.bookName,
                        available: book.available
                    },
                    user: request.userID,
                    requestDate: request.requestDate
                }))
        );

        res.json(pendingRequests);
    } catch (err) {
        console.error('Error fetching pending requests:', err);
        res.status(500).json({ error: 'Error fetching pending requests' });
    }
};

// New function to handle request approval/rejection
exports.handleBookRequest = async (req, res) => {
    try {
        const { bookID, requestID, status, userID } = req.body;

        const book = await Library.findById(bookID);
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }

        const request = book.requests.id(requestID);
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        request.status = status;

        if (status === 'approved') {
            // Issue the book if approved
            if (book.available <= 0) {
                return res.status(400).json({ error: 'Book is no longer available' });
            }

            const user = await User.findById(userID);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            book.available -= 1;
            book.issued += 1;

            user.issuedBooks.push({
                bookName: book.bookName,
                cover: book.cover,
                pdf: book.pdf,
                bookID: book._id,
                rating: book.rating,
                available: book.available,
                issued: book.issued
            });

            await user.save();
        }

        await book.save();

        res.json({
            success: true,
            message: `Request ${status} successfully`
        });
    } catch (err) {
        console.error('Error handling book request:', err);
        res.status(500).json({ error: 'Error handling book request' });
    }
};
