const std = @import("std");
const c = @cImport({
    @cInclude("sys/mman.h");
    @cInclude("sys/stat.h");
    @cInclude("fcntl.h");
    @cInclude("unistd.h");
    @cInclude("errno.h");
});

// Export C-compatible functions for Bun FFI

export fn ipc_shm_open(name_ptr: [*]const u8, name_len: usize, size: usize) i32 {
    const name = name_ptr[0..name_len];
    // We need a null-terminated string for C API.
    // In a real app we might allocate, but here we expect the caller to provide a safe name.
    // However, shm_open expects a C string.
    // Let's alloc a buffer on stack or heap.
    var buf: [256]u8 = undefined;
    if (name.len >= buf.len - 1) return -1;
    @memcpy(buf[0..name.len], name);
    buf[name.len] = 0;
    const c_name = @as([*c]const u8, &buf);

    // O_CREAT | O_RDWR
    const fd = c.shm_open(c_name, c.O_CREAT | c.O_RDWR, 0o666);
    if (fd < 0) return -1;

    // Truncate to size
    const res = c.ftruncate(fd, @intCast(size));
    if (res < 0) {
        _ = c.close(fd);
        _ = c.shm_unlink(c_name);
        return -1;
    }

    return fd;
}

export fn ipc_shm_unlink(name_ptr: [*]const u8, name_len: usize) i32 {
    var buf: [256]u8 = undefined;
    if (name_len >= buf.len - 1) return -1;
    @memcpy(buf[0..name_len], name_ptr[0..name_len]);
    buf[name_len] = 0;
    const c_name = @as([*c]const u8, &buf);

    return c.shm_unlink(c_name);
}

// Map the memory
// Returns pointer to memory or null on failure
export fn ipc_mmap(fd: i32, size: usize) ?*anyopaque {
    const ptr = c.mmap(null, size, c.PROT_READ | c.PROT_WRITE, c.MAP_SHARED, fd, 0);
    if (ptr == c.MAP_FAILED) return null;
    return ptr;
}

export fn ipc_munmap(ptr: *anyopaque, size: usize) i32 {
    return c.munmap(ptr, size);
}

export fn ipc_close(fd: i32) i32 {
    return c.close(fd);
}
