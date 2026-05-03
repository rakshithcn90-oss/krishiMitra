import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const SYSTEM_PROMPT = `
You are KrishiMitra AI, an expert agricultural assistant.
Your goal is to help farmers diagnose crop problems and provide practical solutions.

EXTREMELY IMPORTANT: You must respond in the LANGUAGE requested by the user. 
If the language is 'Kannada', 'Hindi', 'Telugu', 'Tamil', etc., provide the full diagnosis in that language.

Analyze the input and return a professional JSON response with the following structure:
{
  "diagnosis": "Name of problem in the requested language",
  "explanation": "Simple explanation in the requested language",
  "steps": ["Step 1 in requested language", "Step 2", ...],
  "treatment": {
    "product": "Product name and dose in requested language",
    "timing": "Timing in requested language",
    "prevention": "Prevention tips in requested language"
  },
  "urgency": "High" | "Medium" | "Low",
  "confidence": 0-100
}

Adjust advice based on weather if provided.
Always use simple, encouraging language suitable for farmers.
`;

export async function analyzeCrop(
  transcript: string,
  crop: string,
  location: string,
  weather: any,
  language: string,
  imageBase64?: string,
  mimeType?: string
) {
  const model = "gemini-3-flash-preview";
  
  const weatherContext = weather 
    ? `Weather at ${location}: ${weather.temp}°C, Humidity ${weather.humidity}%, Condition ${weather.condition}.`
    : `Location: ${location}. Weather data unavailable.`;

  const prompt = `
    Target Language: ${language}
    Crop: ${crop}
    Farmer Input: ${transcript}
    ${weatherContext}
    
    Please analyze the situation and provide the JSON diagnosis in ${language}.
  `;

  const contents: any[] = [{ text: prompt }];

  if (imageBase64 && mimeType) {
    contents.push({
      inlineData: {
        mimeType: mimeType,
        data: imageBase64,
      },
    });
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: contents }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
    },
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse AI response", response.text);
    return {
      error: "Failed to parse analysis results.",
      raw: response.text
    };
  }
}
