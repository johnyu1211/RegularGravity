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

        // Block physical user input during drag to prevent user interference
        BlockInput(true);
        try {
            // Move to start position
            SetCursorPos(startX, startY);
            Thread.Sleep(50);

            // Press mouse down
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(50);

            // Teleport directly to end position (instant drag)
            SetCursorPos(endX, endY);
            Thread.Sleep(500);

            // Release mouse
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(50);

            // Return mouse to original position
            SetCursorPos(returnX, returnY);
        }
        finally {
            // Unblock input
            BlockInput(false);
        }
    }
}
