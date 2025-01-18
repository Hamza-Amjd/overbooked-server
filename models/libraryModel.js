const mongoose = require('mongoose');

require('dotenv').config();

mongoose.connect(process.env.DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Database connected'))
  .catch(err => console.log('Error connecting to database:', err));


const librarySchema = new mongoose.Schema({
  bookName: {
    type: String,
    required: true
  },
  author: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: [
      'Fiction',
      'Non-Fiction',
      'Science',
      'History',
      'Romance',
      'Mystery',
      'Fantasy',
      'Biography',
      'Self-Help',
      'Technology'
    ]
  },
  issued: {
    type: Number,
    default: 0
  },
  available: {
    type: Number,
    required: true
  },
  total: {
    type: Number,
    required: true
  },
  cover: String,
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  pdf: String,
  readCount: {
    type: Number,
    default: 0
  },
  requests: [{
    userID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userName: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'returned'],
      default: 'pending'
    },
    requestDate: {
      type: Date,
      default: Date.now
    }
  }]
});


const Library = mongoose.model('Library', librarySchema);


const uploadBookWithPdf = async (bookDetails, pdfFile) => {
  try {
    const pdfBuffer = require('fs').readFileSync(pdfFile); 
    const newBook = new Library({
      ...bookDetails,
      pdf: pdfBuffer,
    });
    await newBook.save();
    console.log('New book saved:', newBook);
  } catch (err) {
    console.error('Error uploading book:', err);
  }
};


// const bookDetails = {
//   bookName: "Diary of a Wimpy Kid: The Long Haul",
//   issued: 160,
//   available: 40,
//   total: 200,
//   cover: "https://upload.wikimedia.org/wikipedia/en/thumb/3/3c/Diary_of_a_Wimpy_Kid_The_Long_Haul_book_cover.jpg/220px-Diary_of_a_Wimpy_Kid_The_Long_Haul_book_cover.jpg",
//   rating: 5,
// };

// const pdfPath = './path/to/your/file.pdf'; // Path to the PDF file
// uploadBookWithPdf(bookDetails);

module.exports = Library;
