# Use Node.js 18 with Python support
FROM node:18-bullseye

# Install Python and pip
RUN apt-get update && apt-get install -y \
    python3.9 \
    python3.9-pip \
    python3.9-dev \
    python3.9-venv \
    && rm -rf /var/lib/apt/lists/*

# Create symbolic links for python commands
RUN ln -s /usr/bin/python3.9 /usr/bin/python3 && \
    ln -s /usr/bin/python3.9 /usr/bin/python && \
    ln -s /usr/bin/pip3.9 /usr/bin/pip3 && \
    ln -s /usr/bin/pip3.9 /usr/bin/pip

# Set working directory
WORKDIR /app

# Copy Python requirements and install Python dependencies
COPY requirements.txt .
RUN python3 -m pip install --upgrade pip && \
    python3 -m pip install --no-cache-dir -r requirements.txt

# Copy package files and install Node.js dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy the rest of the application
COPY . .

# Build the Next.js application
RUN npm run build

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]