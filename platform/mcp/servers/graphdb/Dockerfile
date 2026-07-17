FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN yarn build

FROM node:20-alpine AS release

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/yarn.lock ./

# Install production dependencies only
RUN yarn install --production --frozen-lockfile

ENV NODE_ENV=production

# Set execute permissions on the entry point
RUN chmod +x /app/dist/index.js

ENTRYPOINT ["node", "dist/index.js"]