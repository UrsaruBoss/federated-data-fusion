module.exports = {
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/src/jest.polyfills.js"],
  setupFilesAfterEnv: ["<rootDir>/src/setupTests.js"],
  moduleNameMapper: {
    "\\.(css|scss|sass)$": "identity-obj-proxy",
  },
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};
