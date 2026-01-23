FROM oven/bun:1.3.6 AS build

# Build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-dev \
    python3-pip \
    ca-certificates \
    curl \
    xz-utils \
    file \
    gcc \
    iproute2 \
    iputils-ping \
    bpftrace \
    netcat-openbsd \
    procps \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install requests --break-system-packages

# Install Zig (manually fetching binary since apt version might be old)
RUN curl -L https://ziglang.org/download/0.13.0/zig-linux-x86_64-0.13.0.tar.xz -o zig.tar.xz \
    && tar -xf zig.tar.xz \
    && mv zig-linux-x86_64-0.13.0 /usr/local/zig \
    && ln -s /usr/local/zig/zig /usr/local/bin/zig \
    && rm zig.tar.xz

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

COPY . .

RUN gcc -shared -o libshm.so -fPIC src/shm.c -lrt

FROM oven/bun:1.3.6 AS runtime

# Runtime dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ca-certificates \
    curl \
    xz-utils \
    file \
    iproute2 \
    iputils-ping \
    bpftrace \
    netcat-openbsd \
    procps \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install requests --break-system-packages

WORKDIR /app

COPY --from=build /app /app

ENTRYPOINT ["bunx", "python-ipc-bun", "run"]
CMD ["src/main.ts"]
