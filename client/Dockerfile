# Step 1: Build stage
FROM node:18 AS build

WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock) to install dependencies first
COPY package*.json ./
RUN npm install

# Copy the rest of the frontend source code
COPY . .

# Build the app using Vite (this assumes a Vite React project)
RUN npm run build

# Step 2: Serve the app using Nginx
FROM nginx:alpine

# Create the /etc/letsencrypt directory
RUN mkdir -p /etc/letsencrypt

# Copy the build output from the build stage to Nginx's public folder
COPY --from=build /app/dist /usr/share/nginx/html

# Copy the custom React Router Nginx configuration to /etc/nginx/conf.d/
COPY default.conf /etc/nginx/conf.d/

# Expose port 80 for the frontend app
EXPOSE 80

# Start Nginx to serve the app
CMD ["nginx", "-g", "daemon off;"]
