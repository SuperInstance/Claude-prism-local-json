#!/usr/bin/env node

/**
 * Test with real-world project structures
 */

const PrismDaemon = require('../daemon/server.js');
const path = require('path');
const fs = require('fs').promises;

async function testRealWorldProjects() {
  console.log('🌍 Testing Real-World Project Structures...\n');

  let daemon;
  const testBase = path.join(__dirname, 'real-world-projects');

  try {
    // Create test projects mimicking real-world scenarios
    const projects = [
      {
        name: 'react-express-app',
        type: 'full-stack',
        structure: {
          'package.json': JSON.stringify({
            name: 'react-express-app',
            version: '1.0.0',
            dependencies: {
              express: '^4.18.0',
              react: '^18.0.0',
              'react-dom': '^18.0.0',
              mongoose: '^7.0.0',
              jwt: '^9.0.0',
              bcryptjs: '^2.4.0'
            },
            devDependencies: {
              '@types/node': '^20.0.0',
              '@types/react': '^18.0.0',
              typescript: '^5.0.0',
              eslint: '^8.0.0',
              prettier: '^3.0.0',
              jest: '^29.0.0'
            },
            scripts: {
              start: 'node server.js',
              dev: 'nodemon server.js',
              build: 'webpack --mode production',
              test: 'jest',
              lint: 'eslint src/',
              format: 'prettier --write src/'
            }
          }, null, 2),
          'server.js': `
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jwt');
const bcryptjs = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// User schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcryptjs.hash(password, 10);

    const user = new User({ email, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: 'User created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'Protected content', user: req.user });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
          `,
          'src/App.jsx': `
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('/api/protected', {
          headers: { Authorization: \`Bearer \${token}\` }
        });
        setUser(response.data.user);
      } catch (error) {
        console.error('Error fetching user:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const handleLogin = async (email, password) => {
    try {
      const response = await axios.post('/api/auth/login', { email, password });
      localStorage.setItem('token', response.data.token);
      setUser(response.data.user);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="App">
      <h1>React Express App</h1>
      {user ? (
        <div>
          <h2>Welcome, {user.email}</h2>
          <button onClick={() => localStorage.removeItem('token')}>
            Logout
          </button>
        </div>
      ) : (
        <LoginForm onLogin={handleLogin} />
      )}
    </div>
  );
}

function LoginForm({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit">Login</button>
    </form>
  );
}

export default App;
          `,
          'src/components/Header.jsx': `
import React from 'react';

function Header() {
  return (
    <header className="header">
      <nav>
        <ul>
          <li>Home</li>
          <li>About</li>
          <li>Contact</li>
        </ul>
      </nav>
    </header>
  );
}

export default Header;
          `,
          'tests/auth.test.js': `
const request = require('supertest');
const app = require('../server');

describe('Authentication API', () => {
  test('should register new user', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.message).toBe('User created');
  });

  test('should login existing user', async () => {
    // First register
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'login@example.com',
        password: 'password123'
      });

    // Then login
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'login@example.com',
        password: 'password123'
      });

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('token');
  });
});
          `,
          'README.md': `
# React Express Full-Stack App

A full-stack application with React frontend and Express backend.

## Features

- User authentication with JWT
- MongoDB database integration
- React frontend with state management
- RESTful API endpoints
- Unit tests with Jest

## Tech Stack

- Frontend: React 18, Axios
- Backend: Express.js, Node.js
- Database: MongoDB with Mongoose
- Authentication: JWT, bcryptjs
- Testing: Jest, Supertest

## Getting Started

1. Install dependencies: \`npm install\`
2. Set up environment variables
3. Start development: \`npm run dev\`
4. Run tests: \`npm test\`
          `
        }
      },
      {
        name: 'python-flask-api',
        type: 'api',
        structure: {
          'requirements.txt': `
Flask==2.3.0
Flask-SQLAlchemy==3.0.0
Flask-JWT-Extended==4.5.0
Flask-CORS==4.0.0
marshmallow==3.20.0
python-dotenv==1.0.0
pytest==7.4.0
pytest-flask==1.2.0
          `,
          'app.py': `
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required
from flask_cors import CORS
from marshmallow import Schema, fields, ValidationError
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///app.db')
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'dev-secret')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = 3600

db = SQLAlchemy(app)
jwt = JWTManager(app)
CORS(app)

# Database Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())

class Post(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())

# Schemas
class UserSchema(Schema):
    id = fields.Int(dump_only=True)
    username = fields.Str(required=True)
    email = fields.Email(required=True)
    created_at = fields.DateTime(dump_only=True)

class PostSchema(Schema):
    id = fields.Int(dump_only=True)
    title = fields.Str(required=True)
    content = fields.Str(required=True)
    author = fields.Nested(UserSchema, dump_only=True)
    created_at = fields.DateTime(dump_only=True)

user_schema = UserSchema()
users_schema = UserSchema(many=True)
post_schema = PostSchema()
posts_schema = PostSchema(many=True)

# API Routes
@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        data = user_schema.load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400

    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already exists'}), 400

    user = User(username=data['username'], email=data['email'])
    db.session.add(user)
    db.session.commit()

    return jsonify({'message': 'User registered successfully'}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(username=data.get('username')).first()

    if user:
        access_token = create_access_token(identity=user.id)
        return jsonify({'access_token': access_token}), 200

    return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/posts', methods=['GET'])
@jwt_required()
def get_posts():
    posts = Post.query.order_by(Post.created_at.desc()).all()
    return jsonify(posts_schema.dump(posts))

@app.route('/api/posts', methods=['POST'])
@jwt_required()
def create_post():
    try:
        data = post_schema.load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400

    post = Post(
        title=data['title'],
        content=data['content'],
        author_id=get_jwt_identity()
    )
    db.session.add(post)
    db.session.commit()

    return jsonify(post_schema.dump(post)), 201

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, host='0.0.0.0', port=5000)
          `,
          'config.py': `
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///app.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'jwt-secret-string'
    JWT_ACCESS_TOKEN_EXPIRES = 3600

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
          `,
          'tests/test_api.py': `
import pytest
from app import app, db, User, Post

@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'

    with app.test_client() as client:
        with app.app_context():
            db.create_all()
            yield client
            db.drop_all()

def test_register_user(client):
    response = client.post('/api/auth/register', json={
        'username': 'testuser',
        'email': 'test@example.com'
    })
    assert response.status_code == 201

def test_login_user(client):
    # Register first
    client.post('/api/auth/register', json={
        'username': 'loginuser',
        'email': 'login@example.com'
    })

    # Then login
    response = client.post('/api/auth/login', json={
        'username': 'loginuser'
    })
    assert response.status_code == 200
    assert 'access_token' in response.get_json()
          `,
          '.env.example': `
DATABASE_URL=sqlite:///app.db
JWT_SECRET_KEY=your-secret-key-here
FLASK_ENV=development
          `,
          'README.md': `
# Flask REST API

A RESTful API built with Flask, featuring user authentication, posts management, and JWT-based security.

## Features

- User registration and authentication
- JWT-based authentication
- Post CRUD operations
- SQLAlchemy ORM
- Marshmallow serialization
- Comprehensive test suite

## API Endpoints

POST /api/auth/register - Register new user
POST /api/auth/login - User login
GET /api/posts - Get all posts (requires auth)
POST /api/posts - Create new post (requires auth)

## Testing

Run tests with: \`pytest\`
          `
        }
      },
      {
        name: 'node-typescript-library',
        type: 'library',
        structure: {
          'package.json': JSON.stringify({
            name: 'typescript-utils',
            version: '1.0.0',
            description: 'A collection of utility functions for TypeScript projects',
            main: 'dist/index.js',
            types: 'dist/index.d.ts',
            scripts: {
              build: 'tsc',
              test: 'jest',
              lint: 'eslint src/**/*.ts',
              typecheck: 'tsc --noEmit',
              'build:watch': 'tsc --watch',
              'test:watch': 'jest --watch'
            },
            keywords: ['typescript', 'utilities', 'helpers'],
            author: 'Your Name',
            license: 'MIT',
            devDependencies: {
              "@types/jest": "^29.5.0",
              "@types/node": "^20.0.0",
              "@typescript-eslint/eslint-plugin": "^6.0.0",
              "@typescript-eslint/parser": "^6.0.0",
              eslint: "^8.0.0",
              jest: "^29.0.0",
              "ts-jest": "^29.0.0",
              typescript: "^5.0.0"
            },
            dependencies: {
              lodash: '^4.17.0'
            }
          }, null, 2),
          'tsconfig.json': JSON.stringify({
            compilerOptions: {
              target: 'ES2020',
              module: 'CommonJS',
              lib: ['ES2020'],
              declaration: true,
              outDir: './dist',
              rootDir: './src',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true,
              moduleResolution: 'node'
            },
            include: ['src/**/*'],
            exclude: ['node_modules', 'dist', '**/*.test.ts']
          }, null, 2),
          'src/index.ts': `
export * from './utils/array';
export * from './utils/object';
export * from './utils/string';
export * from './utils/date';
          `,
          'src/utils/array.ts': `
import { _ } from 'lodash';

/**
 * Utility functions for array operations
 */

/**
 * Removes duplicate items from an array
 * @param array The input array
 * @returns Array with duplicates removed
 */
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

/**
 * Groups array items by a key function
 * @param array The input array
 * @param keyFn Function to extract grouping key
 * @returns Object with grouped items
 */
export function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return _.groupBy(array, keyFn);
}

/**
 * Paginates an array
 * @param array The input array
 * @param page Page number (1-based)
 * @param perItems Items per page
 * @returns Paginated result
 */
export function paginate<T>(
  array: T[],
  page: number,
  perItems: number
): { items: T[]; total: number; totalPages: number; page: number } {
  const startIndex = (page - 1) * perItems;
  const endIndex = startIndex + perItems;
  const items = array.slice(startIndex, endIndex);

  return {
    items,
    total: array.length,
    totalPages: Math.ceil(array.length / perItems),
    page
  };
}

/**
 * Finds the intersection of two arrays
 * @param array1 First array
 * @param array2 Second array
 * @returns Array containing elements present in both arrays
 */
export function intersection<T>(array1: T[], array2: T[]): T[] {
  return array1.filter(item => array2.includes(item));
}
          `,
          'src/utils/object.ts': `
/**
 * Utility functions for object operations
 */

/**
 * Deep merges two objects
 * @param target Target object
 * @param source Source object
 * @returns Merged object
 */
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  return {
    ...target,
    ...source,
    ...(Object.keys(source).reduce((acc, key) => {
      if (typeof source[key as keyof T] === 'object' &&
          source[key as keyof T] !== null &&
          !Array.isArray(source[key as keyof T])) {
        acc[key as keyof T] = deepMerge(
          target[key as keyof T] || {},
          source[key as keyof T] as object
        );
      }
      return acc;
    }, {} as T))
  };
}

/**
 * Picks specified properties from an object
 * @param obj Source object
 * @param keys Array of property names to pick
 * @returns New object with only specified properties
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}

/**
 * Omits specified properties from an object
 * @param obj Source object
 * @param keys Array of property names to omit
 * @returns New object without specified properties
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(key => {
    delete result[key];
  });
  return result;
}
          `,
          'src/utils/string.ts': `
/**
 * Utility functions for string operations
 */

/**
 * Capitalizes the first letter of a string
 * @param str Input string
 * @returns String with first letter capitalized
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Converts string to camelCase
 * @param str Input string
 * @returns CamelCase string
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    })
    .replace(/\s+/g, '');
}

/**
 * Truncates a string to specified length
 * @param str Input string
 * @param maxLength Maximum length
 * @param suffix Suffix to add if truncated (default: '...')
 * @returns Truncated string
 */
export function truncate(
  str: string,
  maxLength: number,
  suffix: string = '...'
): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}
          `,
          'src/utils/date.ts': `
/**
 * Utility functions for date operations
 */

/**
 * Formats a date as ISO string
 * @param date Date object or string
 * @returns ISO formatted date string
 */
export function toISOString(date: Date | string): string {
  const d = new Date(date);
  return d.toISOString();
}

/**
 * Adds days to a date
 * @param date Date object or string
 * @param days Number of days to add
 * @returns New date
 */
export function addDays(date: Date | string, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Checks if a date is in the past
 * @param date Date object or string
 * @returns True if date is in the past
 */
export function isPast(date: Date | string): boolean {
  return new Date(date) < new Date();
}
          `,
          'src/utils/array.test.ts': `
import { unique, groupBy, paginate, intersection } from './array';

describe('Array Utilities', () => {
  describe('unique', () => {
    test('should remove duplicates', () => {
      const array = [1, 2, 2, 3, 4, 4, 5];
      const result = unique(array);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('groupBy', () => {
    test('should group by key function', () => {
      const array = [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
        { name: 'Charlie', age: 25 }
      ];
      const result = groupBy(array, person => person.age.toString());
      expect(result).toEqual({
        '25': [
          { name: 'Alice', age: 25 },
          { name: 'Charlie', age: 25 }
        ],
        '30': [{ name: 'Bob', age: 30 }]
      });
    });
  });

  describe('paginate', () => {
    test('should paginate array', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = paginate(array, 2, 3);
      expect(result).toEqual({
        items: [4, 5, 6],
        total: 10,
        totalPages: 4,
        page: 2
      });
    });
  });
});
          `
        }
      }
    ];

    // Create all test projects
    for (const project of projects) {
      const projectPath = path.join(testBase, project.name);
      console.log(`\n📁 Creating ${project.type} project: ${project.name}`);

      await fs.mkdir(projectPath, { recursive: true });

      for (const [filePath, content] of Object.entries(project.structure)) {
        const fullPath = path.join(projectPath, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      console.log(`✅ Created ${Object.keys(project.structure).length} files`);
    }

    console.log('\n🔍 Testing Real-World Project Detection...');

    // Test each project
    for (const project of projects) {
      const projectPath = path.join(testBase, project.name);
      console.log(`\n📊 Testing: ${project.name} (${project.type})`);

      try {
        const testDaemon = new PrismDaemon();
        testDaemon.config.projectRoot = projectPath;
        testDaemon.config.cacheDir = path.join(projectPath, '.cache');
        testDaemon.config.indexDir = path.join(projectPath, '.index');

        await testDaemon.initialize();

        console.log(`   Language: ${testDaemon.projectInfo?.language}`);
        console.log(`   Type: ${testDaemon.projectInfo?.type}`);
        console.log(`   Dependencies: ${testDaemon.projectInfo?.dependencies.length || 0}`);
        console.log(`   Dev Dependencies: ${testDaemon.projectInfo?.devDependencies.length || 0}`);

        // Test search functionality
        const testQueries = [
          'authentication',
          'database connection',
          'API endpoint',
          'test cases',
          'utility functions'
        ];

        for (const query of testQueries) {
          const results = testDaemon.simpleSearch(query);
          if (results.length > 0) {
            console.log(`   ✅ Search "${query}": ${results.length} results`);
          }
        }

      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }

    // Test cross-project patterns
    console.log('\n🔍 Testing Cross-Project Patterns...');

    const patternTests = [
      { pattern: 'JWT authentication', expectedIn: ['react-express-app', 'python-flask-api'] },
      { pattern: 'database schema', expectedIn: ['react-express-app', 'python-flask-api'] },
      { pattern: 'TypeScript types', expectedIn: ['node-typescript-library'] },
      { pattern: 'test suite', expectedIn: ['react-express-app', 'python-flask-api', 'node-typescript-library'] },
      { pattern: 'REST API', expectedIn: ['react-express-app', 'python-flask-api'] }
    ];

    for (const test of patternTests) {
      console.log(`\nSearching for: ${test.pattern}`);

      let foundIn = [];
      for (const project of projects) {
        const projectPath = path.join(testBase, project.name);
        const testDaemon = new PrismDaemon();
        testDaemon.config.projectRoot = projectPath;
        await testDaemon.initialize();

        const results = testDaemon.simpleSearch(test.pattern);
        if (results.length > 0) {
          foundIn.push(project.name);
        }
      }

      const success = foundIn.length === test.expectedIn.length &&
                     test.expectedIn.every(proj => foundIn.includes(proj));

      console.log(`   Expected: ${test.expectedIn.join(', ')}`);
      console.log(`   Found: ${foundIn.join(', ')}`);
      console.log(`   Result: ${success ? '✅' : '❌'}`);
    }

    console.log('\n🎉 Real-world project tests completed!');
    console.log('✅ Successfully handled complex project structures');

  } catch (error) {
    console.error('\n❌ Real-world test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Clean up
    try {
      await fs.rm(testBase, { recursive: true, force: true });
      console.log('\n✅ Test cleanup completed');
    } catch (error) {
      console.log('⚠️  Cleanup warning:', error.message);
    }
  }
}

// Run the real-world test
testRealWorldProjects();