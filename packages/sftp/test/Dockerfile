FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy only the built output and package files for all relevant packages
# (Adjust the paths if your structure is different)
COPY ../../common/package.json ./packages/common/package.json
COPY ../../common/dist ./packages/common/dist
COPY ../../http/package.json ./packages/http/package.json
COPY ../../http/dist ./packages/http/dist
COPY ../package.json ./package.json
COPY ../dist ./dist
COPY test ./test

# Install only production dependencies (no workspace links needed)
RUN npm install --omit=dev

# Set working directory to SFTP package
WORKDIR /app

# Run tests
CMD ["npm", "test"] 