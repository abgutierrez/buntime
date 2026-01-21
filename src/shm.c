#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <string.h>
#include <stdio.h>

// Export C-compatible functions for Bun FFI

int ipc_shm_open(const char* name, size_t name_len, size_t size) {
    // We need a null-terminated string.
    // The caller (Bun) sends a pointer and length.
    // We can assume it's null-terminated if Bun sends CString?
    // But Bun FFI 'ptr' with buffer might not be null terminated if not careful.
    // We'll copy to be safe.
    char name_buf[256];
    if (name_len >= 255) return -1;
    memcpy(name_buf, name, name_len);
    name_buf[name_len] = '\0';

    int fd = shm_open(name_buf, O_CREAT | O_RDWR, 0666);
    if (fd < 0) return -1;

    if (ftruncate(fd, (off_t)size) < 0) {
        close(fd);
        shm_unlink(name_buf);
        return -1;
    }

    return fd;
}

int ipc_shm_unlink(const char* name, size_t name_len) {
    char name_buf[256];
    if (name_len >= 255) return -1;
    memcpy(name_buf, name, name_len);
    name_buf[name_len] = '\0';
    
    return shm_unlink(name_buf);
}

void* ipc_mmap(int fd, size_t size) {
    void* ptr = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (ptr == MAP_FAILED) return NULL;
    return ptr;
}

int ipc_munmap(void* ptr, size_t size) {
    return munmap(ptr, size);
}

int ipc_close(int fd) {
    return close(fd);
}
