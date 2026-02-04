import cloudinary from "./cloudinary.js";

/**
 * Uploads an image buffer to Cloudinary.
 * Returns the secure URL of the uploaded image.
 */
export const uploadToCloudinary = async (file) => {
  try {
    const base64 = file.buffer.toString("base64");
    const dataUri = `data:${file.mimetype};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "book-covers",
    });

    return result.secure_url;
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    throw error;
  }
};
