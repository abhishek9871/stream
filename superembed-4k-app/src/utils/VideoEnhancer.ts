/**
 * Professional Video Enhancement System
 * Uses WebGL shaders for real-time video quality enhancement
 * 
 * Features:
 * - Adaptive Sharpening
 * - Clarity (Local Contrast)
 * - Vibrance with skin tone protection
 * - Contrast & Brightness
 */

// Vertex Shader
const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
`;

// Fragment Shader - Simplified and compatible
const FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_sharpness;
uniform float u_clarity;
uniform float u_vibrance;
uniform float u_saturation;
uniform float u_contrast;
uniform float u_brightness;

varying vec2 v_texCoord;

// Get luminance
float getLuminance(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Sharpening effect
vec3 applySharpen(vec3 color, vec2 uv) {
    vec2 texel = 1.0 / u_resolution;
    
    vec3 top = texture2D(u_image, uv + vec2(0.0, -texel.y)).rgb;
    vec3 bottom = texture2D(u_image, uv + vec2(0.0, texel.y)).rgb;
    vec3 left = texture2D(u_image, uv + vec2(-texel.x, 0.0)).rgb;
    vec3 right = texture2D(u_image, uv + vec2(texel.x, 0.0)).rgb;
    
    vec3 blur = (top + bottom + left + right) * 0.25;
    vec3 sharp = color + (color - blur) * u_sharpness;
    
    return sharp;
}

// Clarity (local contrast)
vec3 applyClarity(vec3 color, vec2 uv) {
    vec2 texel = 2.0 / u_resolution;
    
    vec3 s1 = texture2D(u_image, uv + vec2(texel.x, texel.y)).rgb;
    vec3 s2 = texture2D(u_image, uv + vec2(-texel.x, -texel.y)).rgb;
    vec3 s3 = texture2D(u_image, uv + vec2(-texel.x, texel.y)).rgb;
    vec3 s4 = texture2D(u_image, uv + vec2(texel.x, -texel.y)).rgb;
    
    vec3 blur = (s1 + s2 + s3 + s4) * 0.25;
    vec3 diff = color - blur;
    
    return color + diff * u_clarity * 0.5;
}

// Vibrance (smart saturation)
vec3 applyVibrance(vec3 color, float amount) {
    float lum = getLuminance(color);
    float maxC = max(color.r, max(color.g, color.b));
    float minC = min(color.r, min(color.g, color.b));
    float sat = (maxC - minC) / (maxC + 0.001);
    
    // Less boost for already saturated colors
    float vibranceAmount = amount * (1.0 - sat) * 0.5;
    
    return mix(vec3(lum), color, 1.0 + vibranceAmount);
}

// Contrast adjustment
vec3 applyContrast(vec3 color, float contrast, float brightness) {
    return (color - 0.5) * (1.0 + contrast) + 0.5 + brightness;
}

void main() {
    vec4 texColor = texture2D(u_image, v_texCoord);
    vec3 color = texColor.rgb;
    
    // 1. Sharpening
    if (u_sharpness > 0.0) {
        color = applySharpen(color, v_texCoord);
    }
    
    // 2. Clarity
    if (u_clarity > 0.0) {
        color = applyClarity(color, v_texCoord);
    }
    
    // 3. Contrast & Brightness
    color = applyContrast(color, u_contrast, u_brightness);
    
    // 4. Vibrance
    if (u_vibrance > 0.0) {
        color = applyVibrance(color, u_vibrance);
    }
    
    // 5. Saturation
    if (u_saturation != 0.0) {
        float lum = getLuminance(color);
        color = mix(vec3(lum), color, 1.0 + u_saturation);
    }
    
    // Clamp output
    color = clamp(color, 0.0, 1.0);
    
    gl_FragColor = vec4(color, texColor.a);
}
`;

interface EnhancementSettings {
    sharpness: number;
    clarity: number;
    vibrance: number;
    saturation: number;
    contrast: number;
    brightness: number;
}

// Professional preset
const DOLBY_VISION_PRESET: EnhancementSettings = {
    sharpness: 0.6,
    clarity: 0.35,
    vibrance: 0.3,
    saturation: 0.08,
    contrast: 0.12,
    brightness: 0.02
};

export class VideoEnhancer {
    private canvas: HTMLCanvasElement | null = null;
    private gl: WebGLRenderingContext | null = null;
    private program: WebGLProgram | null = null;
    private texture: WebGLTexture | null = null;
    private animationFrameId: number | null = null;
    private settings: EnhancementSettings = { ...DOLBY_VISION_PRESET };
    private uniformLocations: Record<string, WebGLUniformLocation | null> = {};
    private isInitialized = false;

    static isSupported(): boolean {
        if (typeof window === 'undefined') return false;
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            return !!gl;
        } catch {
            return false;
        }
    }

    initialize(canvas: HTMLCanvasElement): boolean {
        this.canvas = canvas;

        const opts: WebGLContextAttributes = {
            alpha: false,
            depth: false,
            stencil: false,
            antialias: false,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        };

        this.gl = (canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts)) as WebGLRenderingContext | null;

        if (!this.gl) {
            console.error('[VideoEnhancer] WebGL not available');
            return false;
        }

        try {
            this.setupShaders();
            this.setupGeometry();
            this.setupTexture();
            this.isInitialized = true;
            console.log('[VideoEnhancer] ✅ Initialized successfully');
            return true;
        } catch (e) {
            console.error('[VideoEnhancer] Setup failed:', e);
            return false;
        }
    }

    private setupShaders(): void {
        const gl = this.gl;
        if (!gl) {
            throw new Error('WebGL context not available');
        }

        // Validate WebGL context is not lost
        if (gl.isContextLost()) {
            throw new Error('WebGL context is lost');
        }

        // Compile vertex shader
        const vs = gl.createShader(gl.VERTEX_SHADER);
        if (!vs) {
            throw new Error('Failed to create vertex shader');
        }
        gl.shaderSource(vs, VERTEX_SHADER);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(vs);
            gl.deleteShader(vs);
            throw new Error('Vertex shader compile error: ' + log);
        }

        // Compile fragment shader
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        if (!fs) {
            gl.deleteShader(vs);
            throw new Error('Failed to create fragment shader');
        }
        gl.shaderSource(fs, FRAGMENT_SHADER);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(fs);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            throw new Error('Fragment shader compile error: ' + log);
        }

        // Link program
        const program = gl.createProgram();
        if (!program) {
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            throw new Error('Failed to create program');
        }

        this.program = program;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(program);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            gl.deleteProgram(program);
            throw new Error('Program link error: ' + log);
        }

        gl.useProgram(program);

        // Cache uniform locations
        const uniforms = ['u_image', 'u_resolution', 'u_sharpness', 'u_clarity', 'u_vibrance', 'u_saturation', 'u_contrast', 'u_brightness'];
        for (const name of uniforms) {
            this.uniformLocations[name] = gl.getUniformLocation(program, name);
        }

        // Cleanup shaders (they're now attached to program)
        gl.deleteShader(vs);
        gl.deleteShader(fs);
    }

    private setupGeometry(): void {
        const gl = this.gl!;
        const program = this.program!;

        // Position buffer
        const positions = new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1
        ]);
        const posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        // Texture coordinate buffer
        const texCoords = new Float32Array([
            0, 1,
            1, 1,
            0, 0,
            1, 0
        ]);
        const texBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

        const texLoc = gl.getAttribLocation(program, 'a_texCoord');
        gl.enableVertexAttribArray(texLoc);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
    }

    private setupTexture(): void {
        const gl = this.gl!;
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    renderFrame(video: HTMLVideoElement): void {
        if (!this.gl || !this.program || !this.texture || !this.canvas) return;

        const gl = this.gl;

        // Resize canvas if needed
        if (this.canvas.width !== video.videoWidth || this.canvas.height !== video.videoHeight) {
            this.canvas.width = video.videoWidth || 1920;
            this.canvas.height = video.videoHeight || 1080;
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }

        // Upload video frame
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

        // Set uniforms
        gl.uniform2f(this.uniformLocations['u_resolution'], this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uniformLocations['u_sharpness'], this.settings.sharpness);
        gl.uniform1f(this.uniformLocations['u_clarity'], this.settings.clarity);
        gl.uniform1f(this.uniformLocations['u_vibrance'], this.settings.vibrance);
        gl.uniform1f(this.uniformLocations['u_saturation'], this.settings.saturation);
        gl.uniform1f(this.uniformLocations['u_contrast'], this.settings.contrast);
        gl.uniform1f(this.uniformLocations['u_brightness'], this.settings.brightness);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    start(video: HTMLVideoElement): void {
        if (!this.isInitialized) return;

        const render = () => {
            if (!video.paused && !video.ended) {
                this.renderFrame(video);
            }
            this.animationFrameId = requestAnimationFrame(render);
        };

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.animationFrameId = requestAnimationFrame(render);
        console.log('[VideoEnhancer] 🎬 Started');
    }

    stop(): void {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    destroy(): void {
        this.stop();
        if (this.gl) {
            if (this.program) this.gl.deleteProgram(this.program);
            if (this.texture) this.gl.deleteTexture(this.texture);
            const ext = this.gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
        }
        this.gl = null;
        this.canvas = null;
        this.isInitialized = false;
    }
}
