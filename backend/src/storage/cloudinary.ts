// Lightweight Cloudinary wrapper so the rest of the codebase doesn't import cloudinary directly
// Keeps credentials centralised and loaded from env config.

// @ts-ignore – missing type declarations are acceptable for now
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env';

cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary }; 