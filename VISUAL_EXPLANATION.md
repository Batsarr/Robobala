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

### Before (squareSizeCm = 20):
```
createCheckerTexture(20)           Floor Plane (2000cm):
Base Texture (2x2 pattern):        Repeats: 2000/20 = 100
┌──────┬──────┐                   ┌──┬──┬──┬──┬──┬──┬──┬──┐
│      │▓▓▓▓▓▓│                   │  │▓▓│  │▓▓│  │▓▓│  │▓▓│
│      │▓▓▓▓▓▓│       ═══>        ├──┼──┼──┼──┼──┼──┼──┼──┤
├──────┼──────┤                   │▓▓│  │▓▓│  │▓▓│  │▓▓│  │
│▓▓▓▓▓▓│      │                   ├──┼──┼──┼──┼──┼──┼──┼──┤
│▓▓▓▓▓▓│      │                   │  │▓▓│  │▓▓│  │▓▓│  │▓▓│
└──────┴──────┘                   └──┴──┴──┴──┴──┴──┴──┴──┘
                                  Many small squares (20cm each)
```

### After (squareSizeCm = 40):
```
createCheckerTexture(40)           Floor Plane (2000cm):
Base Texture (2x2 pattern):        Repeats: 2000/40 = 50
┌──────┬──────┐                   ┌────┬────┬────┬────┐
│      │▓▓▓▓▓▓│                   │    │▓▓▓▓│    │▓▓▓▓│
│      │▓▓▓▓▓▓│       ═══>        │    │▓▓▓▓│    │▓▓▓▓│
├──────┼──────┤                   ├────┼────┼────┼────┤
│▓▓▓▓▓▓│      │                   │▓▓▓▓│    │▓▓▓▓│    │
│▓▓▓▓▓▓│      │                   │▓▓▓▓│    │▓▓▓▓│    │
└──────┴──────┘                   └────┴────┴────┴────┘
                                  Larger squares (40cm each - 2x bigger)
```

**Explanation:**
- The base texture always has a 2x2 checkerboard pattern
- By changing `squareSizeCm` from 20 to 40, the texture repeats half as many times (50 instead of 100)
- This makes each square appear twice as large (40cm instead of 20cm)

## Summary

Both changes are minimal, surgical modifications that directly address the issues:

1. **Sky seam fix**: Adds edge-mirroring logic to make clouds wrap seamlessly
2. **Floor squares**: Changes one parameter to double the square size

No other functionality is affected.
