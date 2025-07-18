import { ChatGroq } from "@langchain/groq";
import { type Message } from "ai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { pipeline } from "@xenova/transformers";
import path from "path";
import fs from "fs/promises";
import { Embeddings } from "@langchain/core/embeddings";

export const runtime = "nodejs"; 

// --- Custom Embeddings for Xenova ---
class XenovaEmbeddings extends Embeddings {
  private embedder: any;

  constructor(embedder: any) {
    super({});
    if (typeof embedder !== "function") {
      throw new Error("XenovaEmbeddings expects a pipeline function.");
    }
    this.embedder = embedder;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const result = await this.embedder(texts, { pooling: "mean", normalize: true });
    return result.tolist();
  }

  async embedQuery(text: string): Promise<number[]> {
    const result = await this.embedder(text, { pooling: "mean", normalize: true });
    return result.tolist()[0];
  }
}

let vectorStore: MemoryVectorStore | null = null;
let initializationPromise: Promise<void> | null = null;

async function _initializeVectorStoreInternal(): Promise<void> {
  console.log("Starting vector store initialization...");
  try {
    const embedderFunction = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    console.log("Embedding pipeline initialized.");

    const embeddingsInstance = new XenovaEmbeddings(embedderFunction);
    const docsPath = path.join(process.cwd(), "data", "science");

    try {
      await fs.access(docsPath);
    } catch (err) {
      console.warn(`Directory not found: ${docsPath}. No PDFs loaded.`);
      vectorStore = await MemoryVectorStore.fromTexts([], [], embeddingsInstance);
      return;
    }

    const pdfFiles = await fs.readdir(docsPath);
    const pdfPaths = pdfFiles.filter(f => f.endsWith(".pdf")).map(f => path.join(docsPath, f));

    if (pdfPaths.length === 0) {
      console.warn("No PDF files found.");
      vectorStore = await MemoryVectorStore.fromTexts([], [], embeddingsInstance);
      return;
    }

    console.log(`Found ${pdfPaths.length} PDF files. Loading...`);
    const allDocs = [];
    for (const pdfPath of pdfPaths) {
      const loader = new PDFLoader(pdfPath);
      const docs = await loader.load();
      allDocs.push(...docs);
    }

    console.log(`Loaded ${allDocs.length} document pages.`);
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const splitDocs = await splitter.splitDocuments(allDocs);
    console.log(`Split into ${splitDocs.length} chunks.`);

    vectorStore = await MemoryVectorStore.fromDocuments(splitDocs, embeddingsInstance);
    console.log("Vector store initialized.");
  } catch (error) {
    console.error("Vector store init error:", error);
    initializationPromise = null;
    vectorStore = null;
    throw error;
  }
}

function initializeVectorStore(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = _initializeVectorStoreInternal();
  }
  return initializationPromise;
}

initializeVectorStore();

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages: Message[] };
    await initializeVectorStore();

    if (!vectorStore) throw new Error("Vector store not initialized.");

    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    const userQuery = lastUserMessage?.content || "";

    let retrievedContext = "";
    if (userQuery) {
      console.log("Performing similarity search...");
      const relevantDocs = await vectorStore.similaritySearch(userQuery, 4);
      retrievedContext = relevantDocs.map(doc => doc.pageContent).join("\n\n---\n\n");
      console.log("Retrieved context:", retrievedContext.substring(0, 500) + (retrievedContext.length > 500 ? "..." : ""));
    }

    const systemMessage = `
You are an AI assistant named **Exam Buddy**, designed to help a student in class six prepare for their board exams.
You have access to a database of past question papers and their answers.

Here is the most relevant context from past papers:
${retrievedContext || "No specific context was retrieved. You can still help based on general Class 6 knowledge."}

Use the context to help the student answer effectively. If something isn't covered, politely say so and suggest using the textbook or general reasoning.
    `.trim();

    const llm = new ChatGroq({
      model: "llama3-8b-8192",
      apiKey: process.env.GROQ_API_KEY!,
    });

    const conversation = [
      { role: "system", content: systemMessage },
      ...messages.map(msg => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      })),
    ];

    const result = await llm.invoke(conversation);

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
