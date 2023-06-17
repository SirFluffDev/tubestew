import { createCanvas, registerFont } from "canvas";
import fs from 'fs/promises'

let font_counter = 0;
export class TextRenderer {
    /**
     * Create a new subtitle renderer
     * @param {string} font_path Path to the font file to use
     * @param {number} font_size Font size to use (px)
     * @param {string} font_color Font color to use
     * @param {{'center'}} text_align How to align text
     */
    constructor(font_path, font_size, font_color, text_align = 'center') {
        // Setup font
        this.font_path = font_path;
        this.family = `font_${font_counter++}`;

        registerFont(font_path, { family: this.family });

        // Save font properties
        this.font_size = font_size;
        this.font_color = font_color;
        this.text_align = text_align;

        this.canvas = createCanvas();
        this.ctx = this.canvas.getContext('2d');

        this.#configure_font();
    }

    #configure_font() {
        this.ctx.font = `${this.font_size}px ${this.family}`;
        this.ctx.fillStyle = this.font_color;
        this.ctx.textAlign = this.text_align;
    }

    /**
     * Wrap lines over width
     * @param {string} text 
     * @param {number} max_width 
     * @returns {string[]}
     */
    #wrap_text(text, max_width) {
        const words = text.split(" ");
        const lines = [];
        let current_line = words[0];

        for (let i = 1; i < words.length; i++) {
            let word = words[i];
            let width = this.ctx.measureText(current_line + " " + word).width;
            if (width < max_width) {
                current_line += " " + word;
            } else {
                lines.push(current_line);
                current_line = word;
            }
        }

        lines.push(current_line);

        return lines;
    }

    /**
     * Render text to file
     * @param {string} out_path 
     * @param {string} text 
     * @param {number} max_width 
     * @param {number} width 
     * @returns {Promise<void>}
     */
    render_text(out_path, text, max_width, width = max_width) {
        console.log(text);
        const lines = this.#wrap_text(text, max_width);

        this.canvas.width = width;
        this.canvas.height = lines.length * this.font_size + Math.ceil(this.font_size / 2);

        this.#configure_font();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            this.ctx.fillText(line, width / 2, (i + 1) * this.font_size);
        }

        const buffer = this.canvas.toBuffer('image/png');
        return fs.writeFile(out_path, buffer);
    }
}