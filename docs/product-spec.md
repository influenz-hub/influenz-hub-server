# Influenz Hub — Old ChatGPT Ideas

## Purpose

Influenz Hub is a platform created by Influenz to help independent businesses/indies gain visibility.

The application allows users to discover:

- Stores
- Products
- Services
- Businesses

Stores are the main priority of the MVP.

The platform will have:

- Mobile application
- Website
- Server

# Authentication

- It will use NextAuth.
- Authentication methods:
    - Google
    - Email
    - Phone
- Each account will contain:
    - Full Name
    - Date of Birth
    - Email
    - Phone Number
    - Profile Picture
    - Other personal details
- Each user will have a profile.
- Users can interact with content:
    - Like
    - Comment
    - Follow

# Profile

- The profile represents the business/indie identity.
- It can display:
    - Stores
    - Products
    - Services
- Stores will have priority over services.
- The profile can contain:
    - Business Name
    - Logo
    - Banner
    - Description
    - Category
    - Location
    - Contact Information
    - Social Links
- It can contain:
    - Likes
    - Comments
    - Followers
    - Reviews
- It can have:
    - Verification status
    - Featured status
- It can display statistics:
    - Profile views
    - Store visits
    - Product views
    - Followers

# Store

- Stores represent the main business activity.
- A profile can have one or multiple stores.
- A store can contain:
    - Name
    - Description
    - Images
    - Location
    - Opening hours
    - Contact information
    - Category
- A store can contain:
    - Products
    - Posts
    - Reviews
- Stores can have:
    - Likes
    - Comments
    - Followers

# Product

- Products represent items sold by stores.
- Products will contain:
    - Name
    - Description
    - Images
    - Price
    - Category
    - Store reference
- Products will have:
    - Stock Management System
    - Quantity tracking
    - Availability status
- Products can contain:
    - Likes
    - Comments
    - Reviews
- Future:
    - Product variants
    - Colors
    - Sizes

# Service

- Services represent activities offered by businesses.

Examples:

- Design
- Consulting
- Development
- Photography
- Services will not take as much space as stores/products.
- Services can contain:
    - Name
    - Description
    - Images
    - Price range
    - Category
    - Contact method
- Services can contain:
    - Likes
    - Comments
    - Reviews

# Posts / Updates

- Businesses can publish updates.

Examples:

- New products
- Promotions
- Announcements
- Posts can contain:
    - Text
    - Images
    - Product references
    - Store references
- Posts can receive:
    - Likes
    - Comments

# Categories

- Categories will help users discover content.

Examples:

- Fashion
- Food
- Technology
- Beauty
- Art
- Services

Categories can be attached to:

- Profiles
- Stores
- Products
- Services

# Search & Discovery

- Users can search:
    - Businesses
    - Stores
    - Products
    - Services
- Search filters:
    - Category
    - Location
    - Popularity
    - Featured

# Follow System

- Users can follow:
    - Profiles
    - Stores
    - Products
- Following will help:
    - Personal recommendations
    - Notifications
    - User retention

# Media Management

- Images will be handled separately.

Supported media:

- Profile pictures
- Logos
- Store banners
- Product images
- Screenshots

The system should avoid duplicating media data.

# Comments & Likes

- Likes and comments should be reusable for:
    - Profiles
    - Stores
    - Products
    - Services
    - Posts
- The system should avoid creating separate tables for every entity.

# Notifications

Users can receive notifications for:

- Likes
- Comments
- New followers
- New products
- New posts

# Recommendation Algorithm

- This will be a daily background process.

Responsibilities:

- Analyze user interactions.
- Generate recommendations.
- Detect trending stores/products.
- Improve discovery.

Examples:

- Recommended stores
- Trending products
- Similar businesses

# Server

The server is the part of the application running on a VPS.

Responsibilities:

- API handling
- Authentication
- Database communication
- Media handling
- Background jobs
- Security

# Background Jobs

Daily automated tasks:

- Database backups
- System checks
- Generate statistics
- Run recommendation algorithm
- Clean unused data

# Website

- Built with Next.js.

Responsibilities:

- Public platform
- User interface
- API

Contains:

- Landing page
- Discovery pages
- Store pages
- Product pages
- Profile pages
- User dashboard

# Mobile Application

- The mobile application is the main user experience.

Responsibilities:

- Discovery
- Following businesses
- Viewing stores/products
- User interactions

# Dashboard

Businesses should have a management area.

Contains:

- Profile management
- Store management
- Product management
- Stock management
- Statistics
- Content management

# Analytics

Businesses can see:

- Profile views
- Store views
- Product views
- Likes
- Followers

# Admin Panel

Influenz administrators can manage:

- Users
- Businesses
- Verification
- Featured content
- Reports
- Categories

# Security

The system should include:

- Permission management
- User roles
- Data validation
- API protection
- Rate limiting

# MVP Priority

Priority order:

1. Authentication
2. Business Profiles
3. Stores
4. Products
5. Discovery
6. Likes/Comments
7. Following
8. Dashboard
9. Notifications
10. Algorithm

# Design Style

Influenz Hub should follow the Influenz brand style.

Main feeling:

"Where independent ideas become influential."

Style:

- Premium
- Creative
- Modern
- Purple focused
- Community driven

UI:

- Rounded cards
- Smooth animations
- Glass effects
- Purple gradients
- Dark theme
- Clean spacing

The application should feel like:

- A discovery platform
- A creator ecosystem
- A modern marketplace

# Cursor Development Prompt

```
Build the Influenz Hub application based on this documentation.

Do not rush the implementation.

Before writing code, analyze the full structure of the application and create a clean scalable architecture.

Respect the UI/UX style defined in this document:
- Premium modern design
- Purple focused branding
- Dark theme
- Smooth animations
- Rounded cards
- Clean spacing
- Creative ecosystem feeling

The application should not look like a basic marketplace.
It should feel like a platform where independent businesses are discovered.

Create a professional folder structure, reusable components, and maintainable code.

Think about scalability from the beginning:
- Clean database models
- Good API organization
- Separation of responsibilities
- Reusable UI components
- Proper state management

Build both the user experience and the business management experience properly.

Do not create rushed placeholder interfaces.
Each screen should have a clear UX purpose.

Focus on:
- Beautiful discovery experience
- Store-first approach
- Strong profile presentation
- Product visualization
- Smooth navigation

Follow good engineering practices and prioritize code quality over speed.
```