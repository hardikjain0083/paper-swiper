// setup-mongodb.js - Script to help set up MongoDB connection
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔧 YT Backend MongoDB Setup\n');

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupMongoDB() {
  try {
    console.log('📋 Please provide your MongoDB connection details:');
    
    const mongoUri = await question('Enter your MongoDB connection string (mongodb+srv://username:password@cluster.mongodb.net/database): ');
    
    if (!mongoUri || !mongoUri.includes('mongodb')) {
      console.log('❌ Invalid MongoDB connection string provided');
      return;
    }

    // Create .env file content
    const envContent = `# Environment Variables for YT Backend
# MongoDB Connection String
MONGO_URI=${mongoUri}

# Server Configuration
PORT=5000
NODE_ENV=development

# Optional: Add any other environment variables you need
# JWT_SECRET=your_jwt_secret_here
# API_KEYS=your_api_keys_here
`;

    // Write .env file
    const envPath = path.join(__dirname, '.env');
    fs.writeFileSync(envPath, envContent);
    
    console.log('✅ .env file created successfully!');
    console.log('📁 Location:', envPath);
    
    // Test the connection
    console.log('\n🧪 Testing MongoDB connection...');
    
    // Load environment variables
    require('dotenv').config();
    
    // Test MongoDB connection
    const mongoose = require('mongoose');
    
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
      });
      
      console.log('✅ MongoDB connection successful!');
      console.log('📊 Database:', mongoose.connection.db.databaseName);
      
      // Test creating a user
      const User = require('./models/User');
      const testUser = new User({
        name: 'Test User',
        email: 'test@example.com',
        completedVideos: [],
        playlists: []
      });
      
      await testUser.save();
      console.log('✅ Database write test successful!');
      
      // Clean up test user
      await User.deleteOne({ email: 'test@example.com' });
      console.log('✅ Database cleanup successful!');
      
      await mongoose.disconnect();
      console.log('✅ MongoDB connection closed');
      
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
      console.log('\n💡 Troubleshooting tips:');
      console.log('   1. Check your MongoDB connection string');
      console.log('   2. Ensure your MongoDB cluster is running');
      console.log('   3. Verify your IP is whitelisted in MongoDB Atlas');
      console.log('   4. Check your username and password');
      return;
    }
    
    console.log('\n🎉 Setup completed successfully!');
    console.log('🚀 You can now start the server with: npm start');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  } finally {
    rl.close();
  }
}

setupMongoDB();
