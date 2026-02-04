import { v2 as cloudinary } from "cloudinary";

// Cloudinary automatically reads CLOUDINARY_URL from process.env
cloudinary.config({
  secure: true, // always use https
});

export default cloudinary;
