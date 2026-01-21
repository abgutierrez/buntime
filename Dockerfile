FROM oven/bun:1.3.6

# Install Python3 and basic build tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-dev \
    python3-pip \
    curl \
    xz-utils \
    file \
    gcc \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install requests --break-system-packages

# Install Zig (manually fetching binary since apt version might be old)
# We keep Zig for future potential, but use GCC for the immediate fix if needed.
# Actually, let's keep Zig installation as requested but try GCC for build first.
RUN curl -L https://ziglang.org/download/0.13.0/zig-linux-x86_64-0.13.0.tar.xz -o zig.tar.xz \
    && tar -xf zig.tar.xz \
    && mv zig-linux-x86_64-0.13.0 /usr/local/zig \
    && ln -s /usr/local/zig/zig /usr/local/bin/zig \
    && rm zig.tar.xz

WORKDIR /app

COPY . .

RUN bun install

# Try building with GCC
RUN gcc -shared -o libshm.so -fPIC src/shm.c -lrt

CMD ["bun", "src/main.ts"]
