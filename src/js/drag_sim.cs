using System;
using System.Runtime.InteropServices;
using System.Threading;

class DragDropSim {
    [DllImport("user32.dll")]
    static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    static extern bool BlockInput(bool fBlockIt);

    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;

    static void Main(string[] args) {
        if (args.Length < 4) return;
        int startX = int.Parse(args[0]);
        int startY = int.Parse(args[1]);
        int endX = int.Parse(args[2]);
        int endY = int.Parse(args[3]);

        int returnX = startX;
        int returnY = startY;
        if (args.Length >= 6) {
            returnX = int.Parse(args[4]);
            returnY = int.Parse(args[5]);
        }

        // Block input for smooth automated simulation
        BlockInput(true);
        try {
            // 1. Move to start and wait 150ms to let user release physical click
            SetCursorPos(startX, startY);
            Thread.Sleep(150);

            // 2. Press left mouse down and wait 800ms for browser dragstart binding
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(800);

            // 3. Smooth drag movement (40 steps * 5ms = 200ms drag)
            int steps = 40;
            for (int i = 1; i <= steps; i++) {
                int curX = startX + (endX - startX) * i / steps;
                int curY = startY + (endY - startY) * i / steps;
                SetCursorPos(curX, curY);
                Thread.Sleep(5);
            }
            Thread.Sleep(30); // 30ms settle time at drop target

            // 4. Release mouse click (Perform drop)
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(20);

            // 5. Restore mouse position back to the user's original cursor coordinate (DISABLED to prevent jitter)
            // SetCursorPos(returnX, returnY);
        }
        finally {
            BlockInput(false);
        }
    }
}
