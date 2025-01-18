const express = require('express');
const User = require('../models/userModel');
const { OAuth2Client } = require("google-auth-library");
const router = express.Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
exports.googlesignin = async (req, res) => {
    const { id_token } = req.body;
    
    if (!id_token) {
      return res.status(400).json({ message: 'Invalid token'});
    }
  
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      const verifiedEmail = payload.email;
  
      if (!verifiedEmail) {
        throw new UnauthenticatedError("Invalid Token or expired");
      }
  
      let user = await User.findOne({ email: verifiedEmail });
  
      if (user) {
  
        return res.status(200).json({user,access_token:true});
      }
  
      user = new User({
        email: verifiedEmail,
        username: payload.name,
        picture: payload.picture
      });
  
      await user.save();
  
      res.status(200).json({
        user: {
          full_name: `${user.first_name} ${user.last_name}`,
          id: user.id,
          username: user.username,
          picture: user.picture,
          email: user.email,
        },
        access_token: true,
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
};