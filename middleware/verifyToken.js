import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // No token sent
  if (!authHeader) {
    return res.status(401).json("Not authenticated");
  }

  // Format: "Bearer TOKEN"
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json("Token is not valid");
    }

    // attach user info to request
    req.user = user;
    next();
  });
};
