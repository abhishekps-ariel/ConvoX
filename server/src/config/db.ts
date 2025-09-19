import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const url = process.env.MONGO_URI as string;
    console.log("MONGO_URI is:", process.env.MONGO_URI);
    
    if (!url) {
      throw new Error("MONGO_URI environment variable is not defined");
    }
    
    await mongoose.connect(url);
    console.log("MongoDB connected");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

export default connectDB;
