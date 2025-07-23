/**
 * Basic tests for Session Messenger Server
 * These tests ensure basic functionality without requiring the server to be running
 */

describe('Session Messenger Server - Basic Tests', () => {
  test('should have package.json with correct configuration', () => {
    const packageJson = require('../package.json');
    
    expect(packageJson.name).toBe('session-messenger-server');
    expect(packageJson.version).toBe('1.0.0');
    expect(packageJson.main).toBe('server.js');
    expect(packageJson.scripts).toHaveProperty('start');
    expect(packageJson.scripts).toHaveProperty('test');
  });

  test('should have required dependencies in package.json', () => {
    const packageJson = require('../package.json');
    
    expect(packageJson.dependencies).toHaveProperty('ws');
    expect(packageJson.dependencies).toHaveProperty('express');
    expect(packageJson.dependencies).toHaveProperty('cors');
    expect(packageJson.dependencies).toHaveProperty('helmet');
  });

  test('should have server.js file', () => {
    const fs = require('fs');
    const path = require('path');
    
    const serverPath = path.join(__dirname, '..', 'server.js');
    expect(fs.existsSync(serverPath)).toBe(true);
  });

  test('should have package-lock.json file', () => {
    const fs = require('fs');
    const path = require('path');
    
    const lockPath = path.join(__dirname, '..', 'package-lock.json');
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  test('should have required dependencies available', () => {
    // Test that required packages can be loaded
    expect(() => require('ws')).not.toThrow();
    expect(() => require('express')).not.toThrow();
    expect(() => require('cors')).not.toThrow();
    expect(() => require('helmet')).not.toThrow();
  });

  test('should have WebSocket functionality available', () => {
    const WebSocket = require('ws');
    expect(WebSocket).toBeDefined();
    expect(WebSocket.Server).toBeDefined();
  });

  test('should have Express functionality available', () => {
    const express = require('express');
    expect(express).toBeDefined();
    expect(typeof express).toBe('function');
  });

  test('should have environment variables support', () => {
    // Test that environment variables can be accessed
    expect(process.env).toBeDefined();
    expect(typeof process.env).toBe('object');
  });

  test('should have Node.js built-in modules available', () => {
    // Test that Node.js built-in modules work
    expect(require('http')).toBeDefined();
    expect(require('https')).toBeDefined();
    expect(require('fs')).toBeDefined();
    expect(require('path')).toBeDefined();
  });
}); 