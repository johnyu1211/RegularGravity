using System;
using System.Runtime.InteropServices;
using System.Threading;

class DragDropSim {
    [DllImport("user32.dll")]
    static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;

    static void Main(string[] args) {
        if (args.Length < 4) return;
        int startX = int.Parse(args[0]);
        int startY = int.Parse(args[1]);
        int endX = int.Parse(args[2]);
        int endY = int.Parse(args[3]);

        // Move to start position
        SetCursorPos(startX, startY);
        Thread.Sleep(150);

        // Press mouse down
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(150);

        // Move mouse slowly to end position (30 steps, visible drag speed)
        int steps = 30;
        for (int i = 1; i <= steps; i++) {
            int curX = startX + (endX - startX) * i / steps;
            int curY = startY + (endY - startY) * i / steps;
            SetCursorPos(curX, curY);
            Thread.Sleep(15);
        }

        Thread.Sleep(150);
        // Release mouse
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(150);

        // Return mouse to start
        SetCursorPos(startX, startY);
    }
}
