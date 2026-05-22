import React, { useState, useRef, useEffect } from "react";
import { Upload, X, SlidersHorizontal, Image as ImageIcon, Loader2, Sparkles } from "lucide-react";
import { Button } from "@pos/ui";
import { preprocessImage, PreprocessOptions } from "../helpers/image-preprocess";

import { getLogger } from "@/lib/logger";

const log = getLogger("feature:product-import:components:ImageUploadStep");
export function ImageUploadStep({
  onExtract,
  onProgress,
  isLoading,
}: {
  onExtract: (files: File[]) => Promise<void>;
  onProgress?: (current: number, total: number, stage: "preprocessing") => void;
  isLoading: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [options, setOptions] = useState<PreprocessOptions>({
    brightness: 1.0,
    contrast: 1.0,
    deglare: false,
  });
  const [showOptions, setShowOptions] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate previews whenever files or options change
  useEffect(() => {
    let active = true;
    
    const generatePreviews = async () => {
      if (files.length === 0) {
        setPreviews([]);
        return;
      }
      
      setIsProcessing(true);
      try {
        const newPreviews: string[] = [];
        for (let i = 0; i < files.length; i++) {
          if (!active) break;
          const processed = await preprocessImage(files[i], options);
          newPreviews.push(URL.createObjectURL(processed));
          // Previews are generated fast enough, but we could update progress here if we wanted
        }
        
        if (active) {
          setPreviews((prev) => {
            prev.forEach((url) => URL.revokeObjectURL(url));
            return newPreviews;
          });
        }
      } catch (error) {
        log.error("Preview generation failed", error);
      } finally {
        if (active) setIsProcessing(false);
      }
    };

    generatePreviews();

    return () => {
      active = false;
    };
  }, [files, options]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      const newFiles = [...files, ...selected].slice(0, 2000); // Max 2000 files to match CSV
      setFiles(newFiles);
    }
    // Reset input value so the same file can be selected again if removed
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExtract = async () => {
    if (files.length === 0) return;
    
    // We process the images before sending to API to reduce payload and improve OCR
    setIsProcessing(true);
    try {
      const processedFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        if (onProgress) onProgress(i, files.length, "preprocessing");
        const processedBlob = await preprocessImage(files[i], options);
        processedFiles.push(new File([processedBlob], files[i].name, { type: "image/jpeg" }));
      }
      if (onProgress) onProgress(files.length, files.length, "preprocessing");
      await onExtract(processedFiles);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <label className="block text-sm font-bold text-slate-700">
              Upload Gambar Daftar Harga
            </label>
            <p className="text-xs text-slate-500 mt-1">
              Mendukung JPG, PNG, WebP. Kualitas lebih baik membuat ekstraksi lebih akurat.
            </p>
          </div>
          
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className={`p-2 rounded-lg transition-colors ${
              showOptions ? "bg-slate-200 text-slate-900" : "text-slate-400 hover:bg-slate-200"
            }`}
            title="Pengaturan Gambar"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {showOptions && (
          <div className="mb-6 p-4 bg-white rounded-lg border border-slate-200 space-y-4">
            <div className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">
              Pengaturan (berlaku untuk semua)
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                  <span>Brightness</span>
                  <span>{Math.round(options.brightness! * 100)}%</span>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.1"
                  value={options.brightness}
                  onChange={(e) => setOptions({ ...options, brightness: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                  <span>Contrast</span>
                  <span>{Math.round(options.contrast! * 100)}%</span>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.1"
                  value={options.contrast}
                  onChange={(e) => setOptions({ ...options, contrast: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={options.deglare}
                  onChange={(e) => setOptions({ ...options, deglare: e.target.checked })}
                  className="rounded border-slate-300"
                />
                Reduce Glare (Beta)
              </label>
            </div>
          </div>
        )}

        {files.length < 2000 && (
          <div className="mb-4">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleFileChange}
              className="hidden"
              id="image-upload"
            />
            <label
              htmlFor="image-upload"
              className="flex items-center justify-center gap-2 w-full py-8 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-slate-400 hover:bg-slate-100 transition-colors"
            >
              <ImageIcon className="w-6 h-6 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">
                Klik untuk memilih gambar
              </span>
            </label>
          </div>
        )}

        {files.length > 0 && (
          <div className="relative mb-6">
            <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 transition-opacity duration-300 ${isLoading ? "opacity-50" : ""}`}>
              {files.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="relative group aspect-[3/4] bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                  {previews[idx] ? (
                    <img
                      src={previews[idx]}
                      alt={`Preview ${idx + 1}`}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 border border-slate-100">
                      <div className="relative flex items-center justify-center mb-2">
                        <div className="absolute inset-0 border-2 border-slate-200 rounded-full animate-ping opacity-20"></div>
                        <ImageIcon className="w-6 h-6 text-slate-300 animate-pulse relative z-10" />
                      </div>
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Memproses</span>
                    </div>
                  )}
                  {!isLoading && (
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="absolute top-2 right-2 p-1.5 bg-white/90 backdrop-blur-sm text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-sm hover:bg-red-50 hover:text-red-700 hover:scale-110"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            
            {/* Premium Loading Overlay */}
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[2px] rounded-xl">
                <div className="bg-white/90 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200/50 px-6 py-4 rounded-2xl flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-300">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
                    <div className="bg-gradient-to-tr from-blue-600 to-indigo-500 text-white p-2.5 rounded-xl shadow-inner relative z-10">
                      <Sparkles className="w-5 h-5 animate-pulse" />
                    </div>
                    <svg className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)] animate-spin" style={{ animationDuration: '3s' }} viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="1" className="text-slate-200" />
                      <circle cx="50" cy="50" r="48" fill="none" stroke="url(#gradient)" strokeWidth="2" strokeDasharray="75 225" strokeLinecap="round" />
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#6366f1" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <div className="text-center">
                    <h3 className="text-sm font-bold text-slate-800">Mengekstrak Data</h3>
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5">Menganalisis dengan AI Vision...</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <Button
          type="button"
          icon={isProcessing || isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          loading={false} // Disable default loading spinner to use our custom one
          disabled={files.length === 0 || isLoading || isProcessing}
          onClick={handleExtract}
          className={`w-full sm:w-auto transition-all duration-300 ${
            isLoading || isProcessing 
              ? "bg-slate-100 text-slate-500 border-slate-200 shadow-none pointer-events-none" 
              : "bg-slate-900 text-white hover:bg-slate-800 shadow-md hover:shadow-lg"
          }`}
        >
          {isLoading ? "Mengekstrak data..." : isProcessing ? "Memproses gambar..." : "Ekstrak Data dengan AI"}
        </Button>
      </div>
    </div>
  );
}
