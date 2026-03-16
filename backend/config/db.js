const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    let uri = process.env.MONGO_URI;

    // If individual parts are provided, build the URI from them.
    // This avoids Hostinger UI corrupting special chars like @, %, + in a full connection string.
    if (process.env.MONGO_USER && process.env.MONGO_PASS && process.env.MONGO_HOST) {
      const user = encodeURIComponent(process.env.MONGO_USER);
      const pass = encodeURIComponent(process.env.MONGO_PASS); // safely encodes @, #, %, etc.
      const host = process.env.MONGO_HOST;
      const db   = process.env.MONGO_DBNAME || "quiz_app1";
      uri = `mongodb+srv://${user}:${pass}@${host}/${db}?retryWrites=true&w=majority`;
    }

    await mongoose.connect(uri);
    console.log("✅ MongoDB Connected Successfully");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;