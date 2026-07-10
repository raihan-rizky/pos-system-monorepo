"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AnimatedGradientBackgroundProps {
    className?: string;
    children?: React.ReactNode;
    intensity?: "subtle" | "medium" | "strong";
}

interface Beam {
    x: number;
    y: number;
    width: number;
    length: number;
    angle: number;
    speed: number;
    opacity: number;
    hue: number;
    pulse: number;
    pulseSpeed: number;
}

interface BeamPerformanceInput {
    viewportWidth: number;
    devicePixelRatio: number;
    hardwareConcurrency: number;
    deviceMemory: number;
    prefersReducedMotion: boolean;
}

interface BeamPerformanceProfile {
    animate: boolean;
    beamCount: number;
    pixelRatio: number;
    targetFps: number;
    blurRadius: number;
}

export function getBeamPerformanceProfile({
    viewportWidth,
    devicePixelRatio,
    hardwareConcurrency,
    deviceMemory,
    prefersReducedMotion,
}: BeamPerformanceInput): BeamPerformanceProfile {
    if (prefersReducedMotion) {
        return {
            animate: false,
            beamCount: 6,
            pixelRatio: 1,
            targetFps: 0,
            blurRadius: 14,
        };
    }

    const isLowEndDevice =
        viewportWidth < 768 || hardwareConcurrency <= 4 || deviceMemory <= 4;

    if (isLowEndDevice) {
        return {
            animate: true,
            beamCount: 8,
            pixelRatio: 1,
            targetFps: 30,
            blurRadius: 18,
        };
    }

    return {
        animate: true,
        beamCount: 18,
        pixelRatio: Math.min(Math.max(devicePixelRatio, 1), 1.5),
        targetFps: 60,
        blurRadius: 24,
    };
}

function createBeam(width: number, height: number): Beam {
    const angle = -35 + Math.random() * 10;
    return {
        x: Math.random() * width * 1.5 - width * 0.25,
        y: Math.random() * height * 1.5 - height * 0.25,
        width: 30 + Math.random() * 60,
        length: height * 2.5,
        angle: angle,
        speed: 0.6 + Math.random() * 1.2,
        opacity: 0.12 + Math.random() * 0.16,
        hue: 190 + Math.random() * 70,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.02 + Math.random() * 0.03,
    };
}

export function BeamsBackground({
    className,
    children,
    intensity = "strong",
}: AnimatedGradientBackgroundProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const beamsRef = useRef<Beam[]>([]);
    const animationFrameRef = useRef<number | null>(null);

    const opacityMap = {
        subtle: 0.7,
        medium: 0.85,
        strong: 1,
    };

    useEffect(() => {
        const canvasElement = canvasRef.current;
        if (!canvasElement) return;
        const canvas: HTMLCanvasElement = canvasElement;

        const canvasContext = canvas.getContext("2d");
        if (!canvasContext) return;
        const ctx: CanvasRenderingContext2D = canvasContext;

        const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
        const profile = getBeamPerformanceProfile({
            viewportWidth: window.innerWidth,
            devicePixelRatio: window.devicePixelRatio || 1,
            hardwareConcurrency: navigator.hardwareConcurrency || 8,
            deviceMemory: navigatorWithMemory.deviceMemory || 8,
            prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        const frameInterval = profile.targetFps > 0 ? 1000 / profile.targetFps : 0;
        let viewportWidth = window.innerWidth;
        let viewportHeight = window.innerHeight;
        let lastFrameAt = 0;

        const updateCanvasSize = () => {
            viewportWidth = window.innerWidth;
            viewportHeight = window.innerHeight;
            canvas.width = Math.max(1, Math.floor(viewportWidth * profile.pixelRatio));
            canvas.height = Math.max(1, Math.floor(viewportHeight * profile.pixelRatio));
            canvas.style.width = `${viewportWidth}px`;
            canvas.style.height = `${viewportHeight}px`;
            canvas.style.filter = `blur(${profile.blurRadius}px)`;
            ctx.setTransform(profile.pixelRatio, 0, 0, profile.pixelRatio, 0, 0);

            beamsRef.current = Array.from({ length: profile.beamCount }, () =>
                createBeam(viewportWidth, viewportHeight)
            );
            drawScene(false);
        };

        function resetBeam(beam: Beam, index: number, totalBeams: number) {
            const column = index % 3;
            const spacing = viewportWidth / 3;

            beam.y = viewportHeight + 100;
            beam.x =
                column * spacing +
                spacing / 2 +
                (Math.random() - 0.5) * spacing * 0.5;
            beam.width = 100 + Math.random() * 100;
            beam.speed = 0.5 + Math.random() * 0.4;
            beam.hue = 190 + (index * 70) / totalBeams;
            beam.opacity = 0.2 + Math.random() * 0.1;
            return beam;
        }

        function drawBeam(ctx: CanvasRenderingContext2D, beam: Beam) {
            ctx.save();
            ctx.translate(beam.x, beam.y);
            ctx.rotate((beam.angle * Math.PI) / 180);

            // Calculate pulsing opacity
            const pulsingOpacity =
                beam.opacity *
                (0.8 + Math.sin(beam.pulse) * 0.2) *
                opacityMap[intensity];

            const gradient = ctx.createLinearGradient(0, 0, 0, beam.length);

            // Enhanced gradient with multiple color stops
            gradient.addColorStop(0, `hsla(${beam.hue}, 85%, 65%, 0)`);
            gradient.addColorStop(
                0.1,
                `hsla(${beam.hue}, 85%, 65%, ${pulsingOpacity * 0.5})`
            );
            gradient.addColorStop(
                0.4,
                `hsla(${beam.hue}, 85%, 65%, ${pulsingOpacity})`
            );
            gradient.addColorStop(
                0.6,
                `hsla(${beam.hue}, 85%, 65%, ${pulsingOpacity})`
            );
            gradient.addColorStop(
                0.9,
                `hsla(${beam.hue}, 85%, 65%, ${pulsingOpacity * 0.5})`
            );
            gradient.addColorStop(1, `hsla(${beam.hue}, 85%, 65%, 0)`);

            ctx.fillStyle = gradient;
            ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length);
            ctx.restore();
        }

        function drawScene(advance: boolean) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.restore();

            const totalBeams = beamsRef.current.length;
            beamsRef.current.forEach((beam, index) => {
                if (advance) {
                    beam.y -= beam.speed;
                    beam.pulse += beam.pulseSpeed;
                }

                if (beam.y + beam.length < -100) {
                    resetBeam(beam, index, totalBeams);
                }

                drawBeam(ctx, beam);
            });
        }

        function animate(timestamp: number) {
            animationFrameRef.current = null;
            if (document.visibilityState === "hidden") return;

            if (timestamp - lastFrameAt >= frameInterval) {
                drawScene(true);
                lastFrameAt = timestamp;
            }

            animationFrameRef.current = requestAnimationFrame(animate);
        }

        function startAnimation() {
            if (!profile.animate || animationFrameRef.current !== null) return;
            animationFrameRef.current = requestAnimationFrame(animate);
        }

        function stopAnimation() {
            if (animationFrameRef.current === null) return;
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                stopAnimation();
            } else {
                startAnimation();
            }
        };

        updateCanvasSize();
        window.addEventListener("resize", updateCanvasSize);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        startAnimation();

        return () => {
            window.removeEventListener("resize", updateCanvasSize);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            stopAnimation();
        };
    }, [intensity]);

    return (
        <div
            className={cn(
                "relative min-h-screen w-full overflow-hidden bg-neutral-950",
                className
            )}
        >
            <canvas
                ref={canvasRef}
                aria-hidden="true"
                className="absolute inset-0"
            />

            <div className="absolute inset-0 bg-neutral-950/10" aria-hidden="true" />

            <div className="relative z-10 flex min-h-screen w-full items-center justify-center">
                {children}
            </div>
        </div>
    );
}
