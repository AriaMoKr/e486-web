CC = /home/jandej/Private/xDos/toolchain/djgpp/bin/i586-pc-msdosdjgpp-gcc
CFLAGS = -O2 -Wall -Wextra -Iinclude
LDFLAGS = -s

SRCS = src/main.c \
       src/screen.c \
       src/serial.c \
       src/sound.c \
       src/protocol.c

OBJS = $(SRCS:.c=.o)
TARGET = bin/AICHAT.EXE

all: $(TARGET)

$(TARGET): $(OBJS)
	@mkdir -p bin
	$(CC) $(OBJS) -o $(TARGET) $(LDFLAGS)
	@echo "Build successful: $(TARGET)"

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET)

.PHONY: all clean
