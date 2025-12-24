
import { GoogleGenAI } from "@google/genai";

export async function analyzeLogisticsData(data: any, language: string) {
  // Fix: Create instance inside function to ensure the latest API key is used and follow initialization rules.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Create a summary string of the data to keep tokens low
  const summary = JSON.stringify(data.slice(0, 50)); 

  const prompt = `
    As a world-class logistics data analyst, analyze the following recent truck movement data: ${summary}.
    
    The user is viewing a dashboard in ${language}. 
    Provide 4-5 bullet points of high-level insights focusing on:
    1. Throughput efficiency trends.
    2. Notable bottlenecks based on 'totalTime'.
    3. Shift peak hours distribution (07:00-07:00).
    4. Actionable operational improvements.

    MANDATORY: Return the answer as a CLEAR BULLETED LIST in ${language}. 
    Do not provide a conversational intro, just the list of points.
  `;

  try {
    // Fix: Use gemini-3-pro-preview for complex reasoning and data analysis tasks.
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 0.9,
      }
    });
    // Fix: Access .text property directly (not a method).
    return response.text;
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return "Failed to generate AI insights. Please check your connection or API key.";
  }
}