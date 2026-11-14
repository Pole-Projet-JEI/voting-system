# Use a supported Node.js LTS image as the base
FROM node:22-bookworm-slim

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY --chown=node:node package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the server files
COPY --chown=node:node . .

# Expose the port the app runs on
EXPOSE ${PORT:-3000}

# Run the backend without root privileges
USER node

# Run the backend server
CMD ["node", "src/index.mjs"]
