import { describe, it, expect, vi, beforeEach } from "vitest";
import { preprocessImage } from "../image-preprocess";

// Mock global URL and Canvas
global.URL.createObjectURL = vi.fn(() => "blob:test");
global.URL.revokeObjectURL = vi.fn();

describe("preprocessImage", () => {
  let mockFile: File;

  beforeEach(() => {
    mockFile = new File(["test data"], "test.jpg", { type: "image/jpeg" });
  });

  it("returns a Blob after processing", async () => {
    // In node environment without jsdom/canvas, we have to mock Image and Canvas
    const mockDrawImage = vi.fn();
    const mockGetContext = vi.fn(() => ({
      drawImage: mockDrawImage,
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(400) })),
      putImageData: vi.fn(),
    }));
    
    const mockToBlob = vi.fn((cb) => cb(new Blob(["processed"], { type: "image/jpeg" })));

    global.Image = class {
      onload: () => void = () => {};
      src = "";
      width = 100;
      height = 100;
      constructor() {
        setTimeout(() => this.onload(), 10);
      }
    } as any;

    global.document = {
      createElement: vi.fn((tag) => {
        if (tag === "canvas") {
          return {
            getContext: mockGetContext,
            toBlob: mockToBlob,
            width: 0,
            height: 0,
          };
        }
        return {};
      }),
    } as any;

    const result = await preprocessImage(mockFile, {
      brightness: 1.2,
      contrast: 1.1,
      deskew: true,
      deglare: true,
    });

    expect(result).toBeInstanceOf(Blob);
    expect(mockGetContext).toHaveBeenCalledWith("2d");
    expect(mockDrawImage).toHaveBeenCalled();
    expect(mockToBlob).toHaveBeenCalled();
  });

  it("defaults options if none provided", async () => {
     // implementation handles default options seamlessly
     const mockToBlob = vi.fn((cb) => cb(new Blob(["processed"])));
     global.document.createElement = vi.fn(() => ({
       getContext: vi.fn(() => ({
         drawImage: vi.fn(),
         getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
         putImageData: vi.fn(),
       })),
       toBlob: mockToBlob,
     })) as any;

     const result = await preprocessImage(mockFile);
     expect(result).toBeInstanceOf(Blob);
  });
});
