$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms
Add-Type -Language CSharp @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class DesktopInputController {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public uint type;
    public InputUnion U;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
    [FieldOffset(0)] public HARDWAREINPUT hi;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx;
    public int dy;
    public uint mouseData;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct HARDWAREINPUT {
    public uint uMsg;
    public ushort wParamL;
    public ushort wParamH;
  }

  public const uint INPUT_MOUSE = 0;
  public const uint INPUT_KEYBOARD = 1;
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
  public const uint MOUSEEVENTF_WHEEL = 0x0800;
  public const uint KEYEVENTF_KEYUP = 0x0002;
  public const uint KEYEVENTF_UNICODE = 0x0004;

  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool GetCursorPos(out POINT lpPoint);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern short VkKeyScan(char ch);

  public static readonly Dictionary<string, ushort> VirtualKeys = new Dictionary<string, ushort>(StringComparer.OrdinalIgnoreCase) {
    { "BACKSPACE", 0x08 },
    { "TAB", 0x09 },
    { "ENTER", 0x0D },
    { "RETURN", 0x0D },
    { "SHIFT", 0x10 },
    { "CTRL", 0x11 },
    { "CONTROL", 0x11 },
    { "ALT", 0x12 },
    { "ESC", 0x1B },
    { "ESCAPE", 0x1B },
    { "SPACE", 0x20 },
    { "PAGEUP", 0x21 },
    { "PGUP", 0x21 },
    { "PAGEDOWN", 0x22 },
    { "PGDN", 0x22 },
    { "END", 0x23 },
    { "HOME", 0x24 },
    { "LEFT", 0x25 },
    { "UP", 0x26 },
    { "RIGHT", 0x27 },
    { "DOWN", 0x28 },
    { "SELECT", 0x29 },
    { "PRINT", 0x2A },
    { "EXECUTE", 0x2B },
    { "SNAPSHOT", 0x2C },
    { "INSERT", 0x2D },
    { "DELETE", 0x2E },
    { "DEL", 0x2E },
    { "0", 0x30 },
    { "1", 0x31 },
    { "2", 0x32 },
    { "3", 0x33 },
    { "4", 0x34 },
    { "5", 0x35 },
    { "6", 0x36 },
    { "7", 0x37 },
    { "8", 0x38 },
    { "9", 0x39 },
    { "A", 0x41 },
    { "B", 0x42 },
    { "C", 0x43 },
    { "D", 0x44 },
    { "E", 0x45 },
    { "F", 0x46 },
    { "G", 0x47 },
    { "H", 0x48 },
    { "I", 0x49 },
    { "J", 0x4A },
    { "K", 0x4B },
    { "L", 0x4C },
    { "M", 0x4D },
    { "N", 0x4E },
    { "O", 0x4F },
    { "P", 0x50 },
    { "Q", 0x51 },
    { "R", 0x52 },
    { "S", 0x53 },
    { "T", 0x54 },
    { "U", 0x55 },
    { "V", 0x56 },
    { "W", 0x57 },
    { "X", 0x58 },
    { "Y", 0x59 },
    { "Z", 0x5A },
    { "LWIN", 0x5B },
    { "RWIN", 0x5C },
    { "NUMPAD0", 0x60 },
    { "NUMPAD1", 0x61 },
    { "NUMPAD2", 0x62 },
    { "NUMPAD3", 0x63 },
    { "NUMPAD4", 0x64 },
    { "NUMPAD5", 0x65 },
    { "NUMPAD6", 0x66 },
    { "NUMPAD7", 0x67 },
    { "NUMPAD8", 0x68 },
    { "NUMPAD9", 0x69 },
    { "MULTIPLY", 0x6A },
    { "ADD", 0x6B },
    { "SEPARATOR", 0x6C },
    { "SUBTRACT", 0x6D },
    { "DECIMAL", 0x6E },
    { "DIVIDE", 0x6F },
    { "F1", 0x70 },
    { "F2", 0x71 },
    { "F3", 0x72 },
    { "F4", 0x73 },
    { "F5", 0x74 },
    { "F6", 0x75 },
    { "F7", 0x76 },
    { "F8", 0x77 },
    { "F9", 0x78 },
    { "F10", 0x79 },
    { "F11", 0x7A },
    { "F12", 0x7B }
  };

  public static INPUT BuildMouseInput(uint flags, uint mouseData) {
    return new INPUT {
      type = INPUT_MOUSE,
      U = new InputUnion {
        mi = new MOUSEINPUT {
          dx = 0,
          dy = 0,
          mouseData = mouseData,
          dwFlags = flags,
          time = 0,
          dwExtraInfo = IntPtr.Zero
        }
      }
    };
  }

  public static INPUT BuildKeyboardInput(ushort vk, ushort scan, uint flags) {
    return new INPUT {
      type = INPUT_KEYBOARD,
      U = new InputUnion {
        ki = new KEYBDINPUT {
          wVk = vk,
          wScan = scan,
          dwFlags = flags,
          time = 0,
          dwExtraInfo = IntPtr.Zero
        }
      }
    };
  }

  public static void SendInputs(List<INPUT> inputs) {
    if (inputs == null || inputs.Count == 0) {
      return;
    }
    var sent = SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(INPUT)));
    if (sent != inputs.Count) {
      throw new InvalidOperationException("Win32 SendInput failed.");
    }
  }

  public static Dictionary<string, int> GetCursorPoint() {
    POINT point;
    if (!GetCursorPos(out point)) {
      throw new InvalidOperationException("GetCursorPos failed.");
    }
    return new Dictionary<string, int> {
      { "x", point.X },
      { "y", point.Y }
    };
  }

  public static void MoveCursor(int x, int y) {
    if (!SetCursorPos(x, y)) {
      throw new InvalidOperationException("SetCursorPos failed.");
    }
  }

  public static void Click(string button) {
    if (string.Equals(button, "right", StringComparison.OrdinalIgnoreCase)) {
      SendInputs(new List<INPUT> {
        BuildMouseInput(MOUSEEVENTF_RIGHTDOWN, 0),
        BuildMouseInput(MOUSEEVENTF_RIGHTUP, 0)
      });
      return;
    }

    SendInputs(new List<INPUT> {
      BuildMouseInput(MOUSEEVENTF_LEFTDOWN, 0),
      BuildMouseInput(MOUSEEVENTF_LEFTUP, 0)
    });
  }

  public static void DoubleClick(string button) {
    Click(button);
    System.Threading.Thread.Sleep(90);
    Click(button);
  }

  public static void Scroll(int deltaY) {
    SendInputs(new List<INPUT> {
      BuildMouseInput(MOUSEEVENTF_WHEEL, unchecked((uint)deltaY))
    });
  }

  public static ushort ResolveVirtualKey(string keyName) {
    if (string.IsNullOrWhiteSpace(keyName)) {
      throw new ArgumentException("Key name is empty.");
    }

    ushort direct;
    if (VirtualKeys.TryGetValue(keyName.Trim(), out direct)) {
      return direct;
    }

    if (keyName.Length == 1) {
      var packed = VkKeyScan(keyName[0]);
      if (packed == -1) {
        throw new ArgumentException("Unsupported key: " + keyName);
      }
      return unchecked((ushort)(packed & 0xff));
    }

    throw new ArgumentException("Unsupported key: " + keyName);
  }

  public static void PressVirtualKey(ushort virtualKey) {
    SendInputs(new List<INPUT> {
      BuildKeyboardInput(virtualKey, 0, 0),
      BuildKeyboardInput(virtualKey, 0, KEYEVENTF_KEYUP)
    });
  }

  public static void KeyDown(ushort virtualKey) {
    SendInputs(new List<INPUT> { BuildKeyboardInput(virtualKey, 0, 0) });
  }

  public static void KeyUp(ushort virtualKey) {
    SendInputs(new List<INPUT> { BuildKeyboardInput(virtualKey, 0, KEYEVENTF_KEYUP) });
  }

  public static void TypeText(string text) {
    if (string.IsNullOrEmpty(text)) {
      return;
    }

    foreach (var ch in text) {
      SendInputs(new List<INPUT> {
        BuildKeyboardInput(0, ch, KEYEVENTF_UNICODE),
        BuildKeyboardInput(0, ch, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)
      });
    }
  }
}
"@

function Write-JsonLine($payload) {
  [Console]::Out.WriteLine(($payload | ConvertTo-Json -Depth 8 -Compress))
}

function Normalize-IntValue($value, [string]$name) {
  if ($null -eq $value -or $value -eq "") { return $null }
  try {
    return [int][Math]::Round([double]$value)
  } catch {
    throw "Invalid numeric value for $name."
  }
}

function Get-StringArray($value) {
  if ($null -eq $value) { return @() }
  if ($value -is [System.Collections.IEnumerable] -and -not ($value -is [string])) {
    return @($value | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  }
  return @()
}

function Invoke-DesktopInputCommand($payload) {
  $requestedAction = [string]$payload.action
  $action = $requestedAction
  if ($action -eq "type") {
    $action = "text_input"
  } elseif ($action -eq "key") {
    $action = "single_key"
  }
  $durationMs = Normalize-IntValue $payload.durationMs "durationMs"
  if ($null -eq $durationMs) {
    if ($action -eq "wait") {
      $durationMs = 600
    } else {
      $durationMs = 120
    }
  }
  if ($durationMs -lt 0) { $durationMs = 0 }

  $x = Normalize-IntValue $payload.x "x"
  $y = Normalize-IntValue $payload.y "y"
  $deltaY = Normalize-IntValue $payload.deltaY "deltaY"
  $text = if ($null -eq $payload.text) { "" } else { [string]$payload.text }
  $singleKey = if ($null -eq $payload.key) { "" } else { [string]$payload.key }
  $keys = Get-StringArray $payload.keys
  $button = if ($null -eq $payload.button) { "left" } else { [string]$payload.button }
  $message = ""

  if ($action -eq 'move') {
    if ($null -eq $x -or $null -eq $y) {
      throw 'move action requires x and y.'
    }
    [DesktopInputController]::MoveCursor($x, $y)
    Start-Sleep -Milliseconds $durationMs
    $message = ('Mouse moved to ({0}, {1})' -f $x, $y)
  } elseif ($action -eq 'click') {
    if ($null -eq $x -or $null -eq $y) {
      throw 'click action requires x and y.'
    }
    [DesktopInputController]::MoveCursor($x, $y)
    Start-Sleep -Milliseconds 28
    [DesktopInputController]::Click($button)
    Start-Sleep -Milliseconds $durationMs
    $message = ('Mouse click executed at ({0}, {1})' -f $x, $y)
  } elseif ($action -eq 'double_click') {
    if ($null -eq $x -or $null -eq $y) {
      throw 'double_click action requires x and y.'
    }
    [DesktopInputController]::MoveCursor($x, $y)
    Start-Sleep -Milliseconds 28
    [DesktopInputController]::DoubleClick($button)
    Start-Sleep -Milliseconds $durationMs
    $message = ('Mouse double click executed at ({0}, {1})' -f $x, $y)
  } elseif ($action -eq 'right_click') {
    if ($null -eq $x -or $null -eq $y) {
      throw 'right_click action requires x and y.'
    }
    [DesktopInputController]::MoveCursor($x, $y)
    Start-Sleep -Milliseconds 28
    [DesktopInputController]::Click("right")
    Start-Sleep -Milliseconds $durationMs
    $message = ('Mouse right click executed at ({0}, {1})' -f $x, $y)
  } elseif ($action -eq 'scroll') {
    if ($null -eq $deltaY) {
      throw 'scroll action requires deltaY.'
    }
    [DesktopInputController]::Scroll($deltaY)
    Start-Sleep -Milliseconds $durationMs
    $message = ('Mouse wheel scrolled {0}' -f $deltaY)
  } elseif ($action -eq 'text_input') {
    if ([string]::IsNullOrEmpty($text)) {
      throw 'type action requires text.'
    }
    [DesktopInputController]::TypeText($text)
    Start-Sleep -Milliseconds $durationMs
    $message = 'Text input sent'
  } elseif ($action -eq 'single_key') {
    if ([string]::IsNullOrWhiteSpace($singleKey)) {
      throw 'single key action requires key.'
    }
    $vk = [DesktopInputController]::ResolveVirtualKey($singleKey)
    [DesktopInputController]::PressVirtualKey($vk)
    Start-Sleep -Milliseconds $durationMs
    $message = ('Key sent: {0}' -f $singleKey)
  } elseif ($action -eq 'hotkey') {
    if ($keys.Count -eq 0) {
      throw 'hotkey action requires keys.'
    }
    if ($keys.Count -eq 1) {
      $singleVk = [DesktopInputController]::ResolveVirtualKey($keys[0])
      [DesktopInputController]::PressVirtualKey($singleVk)
    } else {
      $resolved = @()
      foreach ($item in $keys) {
        $resolved += ,([DesktopInputController]::ResolveVirtualKey($item))
      }
      for ($i = 0; $i -lt $resolved.Count - 1; $i += 1) {
        [DesktopInputController]::KeyDown($resolved[$i])
        Start-Sleep -Milliseconds 12
      }
      [DesktopInputController]::PressVirtualKey($resolved[$resolved.Count - 1])
      Start-Sleep -Milliseconds 18
      for ($i = $resolved.Count - 2; $i -ge 0; $i -= 1) {
        [DesktopInputController]::KeyUp($resolved[$i])
        Start-Sleep -Milliseconds 10
      }
    }
    Start-Sleep -Milliseconds $durationMs
    $message = 'Hotkey sent'
  } elseif ($action -eq 'wait') {
    Start-Sleep -Milliseconds $durationMs
    $message = ('Waited {0} ms' -f $durationMs)
  } else {
    throw ('Unsupported action: ' + $action)
  }

  return @{
    ok = $true
    action = $requestedAction
    mode = "executed"
    manualRequired = $false
    message = $message
    cursor = [DesktopInputController]::GetCursorPoint()
  }
}

Write-JsonLine @{
  type = "ready"
  ok = $true
}

while (($line = [Console]::In.ReadLine()) -ne $null) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }

  $requestId = ""
  try {
    $message = $line | ConvertFrom-Json
    $requestId = [string]$message.requestId
    $result = Invoke-DesktopInputCommand $message.payload
    Write-JsonLine @{
      type = "result"
      requestId = $requestId
      ok = $true
      result = $result
    }
  } catch {
    Write-JsonLine @{
      type = "result"
      requestId = $requestId
      ok = $false
      error = $_.Exception.Message
    }
  }
}
