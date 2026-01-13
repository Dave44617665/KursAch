FROM node:18.20-slim

# Install build dependencies for mediasoup
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    python3-pip \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Expose ports
EXPOSE 3000
EXPOSE 40000-49999/udp
EXPOSE 40000-49999/tcp

CMD ["npm", "start"]
