# PRISM Project Assistant

A Claude Code agent enhanced with PRISM's project memory for intelligent development assistance.

## Overview

The PRISM Project Assistant provides context-aware code generation, analysis, and assistance based on your project's structure, patterns, and dependencies. It understands your project's architecture and provides more relevant suggestions.

## Capabilities

### 1. **Context-Aware Code Generation**
- Understands your project's coding patterns and conventions
- Generates code that matches your existing style
- Considers your dependencies and framework choices
- Respects your project's architecture decisions

### 2. **Project-Specific Analysis**
- Analyzes your project structure and dependencies
- Identifies patterns and anti-patterns in your codebase
- Provides insights about your project's architecture
- Suggests improvements based on similar projects

### 3. **Enhanced Search & Navigation**
- Semantic search across your entire codebase
- Finds related code and dependencies
- Navigates complex code relationships
- Identifies usage patterns and common patterns

### 4. **Smart Code Suggestions**
- Autocomplete based on your project patterns
- Function and class suggestions that match your style
- Import and dependency management
- Error prevention based on your project conventions

## Usage Examples

### Code Generation with Context

**Without PRISM:**
```
You: Create a user authentication system

Claude: I'll create a basic authentication system for you...
```

**With PRISM Assistant:**
```
You: Create a user authentication system

PRISM Assistant: I'll create a user authentication system for your Express.js project.
I notice you're using passport.js for authentication and MongoDB for database.
I'll create authentication endpoints that follow your existing pattern and integrate with your current setup.

Here's what I'll create:
- User model with validation (following your existing schema pattern)
- Authentication middleware (using passport-local strategy)
- Login and registration endpoints (following your API conventions)
- JWT token management (consistent with your auth setup)
```

### Code Analysis

```
You: Analyze this function for performance issues

PRISM Assistant: Let me analyze this function in the context of your project...

I can see this function processes user data. Looking at your project patterns:
- You typically use async/await for database operations
- You have validation utilities in ./lib/validation.js
- You use the 'perf' package for performance monitoring

Issues I found:
1. The database query is not optimized - consider adding indexes
2. Missing error handling for edge cases
3. No performance monitoring for this critical path
4. Could benefit from caching frequently accessed data

Here's an improved version that follows your project's patterns...
```

### Project Understanding

```
You: How does the payment system work in this project?

PRISM Assistant: I can analyze your payment system architecture...

Based on my analysis of your codebase:
- Payment processing is handled by Stripe integration in ./services/payment.js
- You use the Stripe Node.js client with your API keys from environment variables
- Payments are processed asynchronously using a queue system
- You have webhook handlers for payment events
- Payment data is stored in MongoDB with the 'payments' collection

Key components:
- PaymentService class (handles Stripe operations)
- PaymentController (API endpoints)
- Webhook handlers (payment event processing)
- Database models for payment records
```

## Features

### Auto-Discovery
- Automatically detects your project type and language
- Identifies frameworks and dependencies
- Understands your project structure and patterns
- Learns your coding conventions over time

### Smart Context
- Maintains awareness of your project's state
- Tracks file changes and updates memory accordingly
- Understands project-specific requirements
- Provides relevant suggestions based on context

### Enhanced Search
- Semantic search across your entire codebase
- Finds related code and dependencies
- Searches by functionality, not just keywords
- Understands code relationships and patterns

### Performance Optimization
- Background indexing without blocking your workflow
- Intelligent caching for fast responses
- Optimized search algorithms for large projects
- Memory-efficient storage of project information

## Integration

### Seamless Integration
- Works automatically with Claude Code
- No additional setup required
- Enhances all Claude Code capabilities
- Maintains compatibility with other plugins

### Background Operation
- Runs continuously in the background
- Indexes changes as you work
- Maintains project memory automatically
- No manual intervention required

### Smart Defaults
- Sensible configuration out of the box
- Adapts to your project's needs
- Optimized for most development scenarios
- Customizable for specific requirements

## Configuration

### Environment Variables
- `PRISM_LOG_LEVEL`: Set logging level (debug, info, warn, error)
- `PRISM_CACHE_SIZE`: Maximum cache size in MB
- `PRISM_INDEX_DEPTH`: Depth of code analysis
- `PRISM_AUTO_UPDATE`: Enable automatic memory updates

### Customization
The assistant learns from your coding patterns over time and adapts its suggestions to match your style. You can also provide explicit guidance:

```json
{
  "styleGuide": {
    "indentation": "tabs",
    "quotes": "single",
    "semicolons": true,
    "namingConvention": "camelCase"
  },
  "preferredPatterns": {
    "errorHandling": "try-catch",
    "async": "async-await",
    "database": "mongoose"
  }
}
```

## Troubleshooting

### Common Issues

**Assistant not providing relevant suggestions:**
- Check if plugin is running: `/prism status`
- Reindex your project: `/prism index`
- Verify project detection: `/prism config`

**Memory usage high:**
- Check cache size: `/prism config cache_size`
- Adjust memory limits in configuration
- Exclude large directories from indexing

**Suggestions don't match my style:**
- The assistant learns over time - continue using it
- Provide explicit feedback on suggestions
- Customize your style guide configuration

### Getting Help

For issues and questions:
- Check the PRISM documentation
- Review troubleshooting guide
- Submit issues on GitHub
- Join the community discussions

## Contributing

The PRISM Project Assistant is continuously improving based on user feedback. If you have suggestions for improvements or encounter issues, please contribute to the project:

- GitHub: https://github.com/SuperInstance/Claude-prism-local-json
- Issues: https://github.com/SuperInstance/Claude-prism-local-json/issues
- Discussions: https://github.com/SuperInstance/Claude-prism-local-json/discussions

---

*The PRISM Project Assistant enhances your development experience with intelligent context-aware assistance.*