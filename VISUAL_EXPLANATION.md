# Visual Explanation of Changes

## 1. Sky Dome Seam Fix

### Before (with seam):
```
Sky Texture (2048x1024 canvas):
┌────────────────────────────────────┐
│ Cloud    Cloud        Cloud        │  <- Clouds drawn randomly
│      Cloud        Cloud      Cloud │
│ Cloud         Cloud              X │  <- Right edge
│ Cloud      Cloud          Cloud    │
└────────────────────────────────────┘
         ↓ (wrapped on sphere)
         ↓
    Visible Seam
         ↓
Left edge (X) meets right edge, creating a visible line
```

### After (seamless):
```
Sky Texture (2048x1024 canvas):
┌────────────────────────────────────┐
│ Cloud    Cloud        Cloud     [C]│  <- Original cloud
│      Cloud        Cloud      Cloud │
│[C]        Cloud              [C]   │  <- [C] = Mirrored cloud
│ Cloud      Cloud          Cloud    │
└────────────────────────────────────┘
         ↓ (wrapped on sphere)
         ↓
    No Seam!
         ↓
Mirrored clouds at edges blend seamlessly when wrapped
```

**Key Logic:**
```javascript
// For each cloud:
if (x > width - radius * 2) {
    // Cloud is near right edge
    // Draw a copy on the left edge
    ctx.arc(x - width, y, radius, 0, Math.PI * 2);
}
if (x < radius * 2) {
    // Cloud is near left edge
    // Draw a copy on the right edge
    ctx.arc(x + width, y, radius, 0, Math.PI * 2);
}
```

## 2. Floor Square Size Change

### Before (squares = 2):
```
Base Texture (256x256):        Repeated on Floor:
┌──────┬──────┐                ┌──┬──┬──┬──┬──┬──┐
│      │▓▓▓▓▓▓│                │  │▓▓│  │▓▓│  │▓▓│
│      │▓▓▓▓▓▓│                ├──┼──┼──┼──┼──┼──┤
├──────┼──────┤      ═══>      │▓▓│  │▓▓│  │▓▓│  │
│▓▓▓▓▓▓│      │                ├──┼──┼──┼──┼──┼──┤
│▓▓▓▓▓▓│      │                │  │▓▓│  │▓▓│  │▓▓│
└──────┴──────┘                └──┴──┴──┴──┴──┴──┘
   2x2 grid                    Many small squares
```

### After (squares = 1):
```
Base Texture (256x256):        Repeated on Floor:
┌──────────────┐               ┌──────┬──────┬──────┐
│              │               │      │▓▓▓▓▓▓│      │
│              │               │      │▓▓▓▓▓▓│      │
│              │     ═══>      ├──────┼──────┼──────┤
│              │               │▓▓▓▓▓▓│      │▓▓▓▓▓▓│
│              │               │▓▓▓▓▓▓│      │▓▓▓▓▓▓│
└──────────────┘               └──────┴──────┴──────┘
   1x1 grid                    Larger squares (2x bigger)
```

**Explanation:**
- With `squares = 2`, the base texture has a 2x2 checkerboard pattern
- With `squares = 1`, the base texture is a single solid color
- When repeated with the same repeat count, the 1x1 pattern creates squares that are 2x larger

## Summary

Both changes are minimal, surgical modifications that directly address the issues:

1. **Sky seam fix**: Adds edge-mirroring logic to make clouds wrap seamlessly
2. **Floor squares**: Changes one parameter to double the square size

No other functionality is affected.
