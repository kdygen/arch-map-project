"""Test helper: encode points as a Google encoded polyline."""


def encode(points: list[tuple[float, float]], precision: int = 5) -> str:
    """Encode (latitude, longitude) pairs."""
    factor = 10**precision
    out: list[str] = []
    previous = (0, 0)
    for latitude, longitude in points:
        current = (round(latitude * factor), round(longitude * factor))
        for value, before in zip(current, previous, strict=True):
            delta = value - before
            delta = ~(delta << 1) if delta < 0 else delta << 1
            while delta >= 0x20:
                out.append(chr((0x20 | (delta & 0x1F)) + 63))
                delta >>= 5
            out.append(chr(delta + 63))
        previous = current
    return "".join(out)
