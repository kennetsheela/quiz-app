// Set test environment
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://localhost:27017/quiz-app-test';

// Increase timeout for all tests
jest.setTimeout(30000);