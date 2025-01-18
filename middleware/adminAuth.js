const adminAuth = (req, res, next) => {
  try {
    let user;
    
    // Check if user data is in form data
    if (req.body.user) {
      user = typeof req.body.user === 'string' ? JSON.parse(req.body.user) : req.body.user;
    }

    if (!user || !user.isAdmin) {
      return res.status(403).json({ 
        error: "Access denied. Admin privileges required." 
      });
    }
    
    // Add user to request for later use if needed
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: "Authentication failed" });
  }
};

module.exports = adminAuth; 