const mongoose = require('mongoose');
require('dotenv').config();


mongoose.connect(process.env.DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Database connected'))
  .catch(err => console.log('Error connecting to database:', err));

const userSchema = new mongoose.Schema({
  username: String,
  fullname: String,
  password: String,
  issuedBooks: [
    {
      bookName: String,
      cover: String,
      pdf: String,
      bookID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Library'
      }
    },
  ],
  email: {
    type: String,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
  },
  picture:String,
  numberOfIssuedBooks: Number,
  signedIn: Boolean,
  isAdmin: {
    type: Boolean,
    default: false
  },
  readingProgress: {
    type: Object,
    default: {}
  }
});

const User = mongoose.model("User", userSchema);

module.exports = User;
