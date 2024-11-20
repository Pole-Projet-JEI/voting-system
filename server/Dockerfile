# Use an official Node.js image as the base
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the server files
COPY . .

# Expose the port the app runs on
EXPOSE ${PORT:-3000}

# Run the backend server
CMD ["node", "src/index.mjs"]
