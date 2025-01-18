const PORT = process.env.PORT || 5000;
const server = require("./index.js");
const fs = require('fs');
const path = require('path');

require('dotenv').config();

// Create upload directories if they don't exist
const uploadDirs = ['uploads', 'uploads/pdfs', 'uploads/covers'];
uploadDirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

server.listen(PORT, function(){
    console.log('listening on port: ' + PORT);
});
//weeeeeeeeeeeeewooooooooos
//weeewooo2