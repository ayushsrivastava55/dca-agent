"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConnectButton from "@/components/ConnectButton";

export default function Landing() {
  const router = useRouter();
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);

  const features = [
    {
      emoji: "🤖",
      title: "AI-Powered Planning",
      description: "Smart algorithms analyze market conditions and optimize your DCA execution schedule",
      color: "bg-[#DC2626]",
    },
    {
      emoji: "🔐",
      title: "Secure Delegation",
      description: "MetaMask Delegation Toolkit ensures your funds stay safe with granular permissions",
      color: "bg-[#0F766E]",
    },
    {
      emoji: "⚡",
      title: "Automated Execution",
      description: "Set it and forget it - our agents execute your DCA strategy 24/7",
      color: "bg-[#2563EB]",
    },
    {
      emoji: "📊",
      title: "Real-time Tracking",
      description: "Monitor every transaction with live status updates and comprehensive logs",
      color: "bg-[#F97316]",
    },
  ];

  const stats = [
    { value: "$2.5M+", label: "Volume Processed", color: "bg-[#B91C1C]" },
    { value: "10K+", label: "DCA Executions", color: "bg-[#0E7490]" },
    { value: "99.9%", label: "Uptime", color: "bg-[#1D4ED8]" },
    { value: "24/7", label: "Automated", color: "bg-[#C2410C]" },
  ];

  return (
    <div className="min-h-screen bg-[#FFF0DC]">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b-8 border-black bg-gradient-to-br from-[#B91C1C] via-[#0F766E] to-[#F97316] pb-20 pt-10">
        {/* Nav */}
        <nav className="mx-auto mb-16 flex max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center border-4 border-black bg-white text-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              🤖
            </div>
            <span className="text-3xl font-black text-black">DCA SITTER</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <a
              href="https://docs.metamask.io/delegation-toolkit"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-block border-4 border-black bg-white px-4 py-2 text-xs font-black !text-black hover:!text-black focus:!text-black visited:!text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
            >
              DOCS
            </a>
            <a
              href="https://github.com/ayushsrivastava06/metamask-cookoff"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-block border-4 border-black bg-white px-4 py-2 text-xs font-black !text-black hover:!text-black focus:!text-black visited:!text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
            >
              GITHUB
            </a>
            <button
              onClick={() => router.push("/dashboard")}
              className="border-4 border-black bg-white px-6 py-2 font-black text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
            >
              DASHBOARD
            </button>
            <ConnectButton />
          </div>
        </nav>

        {/* Hero Content */}
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
            <div className="flex flex-col justify-center">
              <div className="mb-6 inline-block w-fit border-4 border-black bg-[#FACC15] px-4 py-2 font-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                POWERED BY METAMASK DTK
              </div>
              <h1 className="mb-6 text-6xl font-black leading-none text-black md:text-7xl">
                AUTOMATE YOUR
                <br />
                <span className="text-white drop-shadow-[0_4px_0_rgba(0,0,0,1)]">DCA STRATEGY</span>
              </h1>
              <p className="mb-8 text-xl font-bold leading-relaxed text-black">
                Dollar-Cost Average like a pro with AI-powered planning and secure delegation. No more manual
                trades, no more stress. Just set your strategy and let DCA Sitter handle the rest.
              </p>
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="border-4 border-black bg-[#B91C1C] px-8 py-4 text-xl font-black text-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none"
                >
                  GET STARTED →
                </button>
                <button className="border-4 border-black bg-white px-8 py-4 text-xl font-black text-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none">
                  LEARN MORE
                </button>
              </div>
            </div>

            {/* Hero Visual */}
            <div className="relative">
              <div className="relative z-10 border-8 border-black bg-white p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                <div className="space-y-4">
                  <div className="border-4 border-black bg-[#0D9488] p-4">
                    <div className="mb-2 text-sm font-black">DCA PLAN</div>
                    <div className="text-2xl font-black">4 LEGS × 25 MON</div>
                  </div>
                  <div className="border-4 border-black bg-[#2563EB] p-4">
                    <div className="mb-2 text-sm font-black">STATUS</div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 animate-ping rounded-full bg-green-500"></div>
                      <span className="font-black">EXECUTING</span>
                    </div>
                  </div>
                  <div className="border-4 border-black bg-[#95E1D3] p-4">
                    <div className="mb-2 text-sm font-black">PROGRESS</div>
                    <div className="h-8 border-4 border-black bg-white">
                      <div className="h-full bg-[#B91C1C] transition-[width] duration-500" style={{ width: "68%" }}></div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="border-4 border-black bg-[#0A84FF] px-4 py-3 text-sm font-black text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-none"
                  >
                    OPEN DASHBOARD
                  </button>
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="border-4 border-black bg-white px-4 py-3 text-sm font-black text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-none"
                  >
                    CREATE DELEGATION
                  </button>
                </div>
              </div>
              {/* Decorative elements */}
              <div className="absolute -right-4 -top-4 h-24 w-24 border-8 border-black bg-[#DC2626]"></div>
              <div className="absolute -bottom-4 -left-4 h-16 w-16 border-8 border-black bg-[#F59E0B]"></div>
            </div>
          </div>
        </div>

        {/* Decorative bottom wave */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-black"></div>
      </section>

      {/* Stats Section */}
      <section className="border-b-8 border-black bg-[#FFE0BF] py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {stats.map((stat, index) => (
              <div
                key={index}
                className={`${stat.color} border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-none rounded-sm`}
              >
                <div className="text-center">
                  <div className="mb-2 text-4xl font-black tracking-tight">{stat.value}</div>
                  <div className="text-sm font-bold uppercase">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-b-8 border-black bg-[#FDF2E9] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-5xl font-black">WHY DCA SITTER?</h2>
            <p className="text-xl font-bold">Everything you need to automate your investment strategy</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {features.map((feature, index) => (
              <div
                key={index}
                onMouseEnter={() => setHoveredFeature(index)}
                onMouseLeave={() => setHoveredFeature(null)}
                className={`${
                  feature.color
                } border-4 border-black p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all ${
                  hoveredFeature === index
                    ? "translate-x-[3px] translate-y-[3px] shadow-none"
                    : ""
                }`}
              >
                <div className="mb-4 text-6xl drop-shadow-[2px_2px_0_rgba(0,0,0,1)]">{feature.emoji}</div>
                <h3 className="mb-3 text-2xl font-black">{feature.title}</h3>
                <p className="font-bold leading-relaxed text-black/80">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-b-8 border-black bg-[#FFFEF2] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-12 text-center text-5xl font-black">HOW IT WORKS</h2>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              { step: "01", title: "CONNECT & DELEGATE", desc: "Link your wallet and create a secure delegation to our agent", color: "bg-[#FF6B6B]" },
              { step: "02", title: "SET YOUR STRATEGY", desc: "Configure your DCA parameters or let AI optimize your plan", color: "bg-[#4ECDC4]" },
              { step: "03", title: "RELAX & TRACK", desc: "Our agent executes trades 24/7 while you monitor in real-time", color: "bg-[#FFE66D]" },
            ].map((item, index) => (
              <div key={index} className="relative">
                <div className={`${item.color} mb-4 inline-block border-4 border-black px-4 py-2 font-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`}>
                  STEP {item.step}
                </div>
                <div className="border-4 border-black bg-white p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                  <h3 className="mb-3 text-2xl font-black">{item.title}</h3>
                  <p className="font-bold text-black/80">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="border-b-8 border-black bg-white py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-10 text-center text-5xl font-black">FAQ</h2>
          <div className="space-y-4">
            {[{
              q: "Is this non-custodial?",
              a: "Yes. You delegate limited permissions via MetaMask DTK; funds stay in your account."
            }, {
              q: "What network does it use?",
              a: "Monad testnet. You can switch networks and fund via the Monad faucet."
            }, {
              q: "Can I revoke the agent?",
              a: "Anytime. Use the dashboard to revoke or pause delegation instantly."
            }].map((item, i) => (
              <div key={i} className="border-4 border-black bg-[#FFFEF2] p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <div className="text-lg font-black">Q{i + 1}. {item.q}</div>
                <div className="mt-2 font-bold text-black/80">{item.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-[#4ECDC4] via-[#95E1D3] to-[#FFE66D] py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="mb-6 text-6xl font-black text-black">
            READY TO AUTOMATE?
          </h2>
          <p className="mb-8 text-2xl font-bold text-black">
            Join thousands of smart investors using DCA Sitter
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="border-4 border-black bg-[#FF6B6B] px-12 py-6 text-2xl font-black text-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[6px] hover:translate-y-[6px] hover:shadow-none"
          >
            START NOW - IT&apos;S FREE →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-8 border-black bg-black py-12 text-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center border-4 border-white bg-[#FF6B6B] text-xl">
                  🤖
                </div>
                <span className="text-2xl font-black">DCA SITTER</span>
              </div>
              <p className="font-bold text-white/80">
                Automated DCA for everyone, powered by MetaMask Delegation Toolkit
              </p>
            </div>
            <div>
              <h4 className="mb-4 text-xl font-black">LINKS</h4>
              <div className="space-y-2 font-bold">
                <div><a href="https://faucet.monad.xyz/" target="_blank" rel="noreferrer" className="hover:text-[#4ECDC4]">Monad Faucet</a></div>
                <div><a href="https://testnet.monadexplorer.com" target="_blank" rel="noreferrer" className="hover:text-[#4ECDC4]">Explorer</a></div>
                <div><a href="https://docs.monad.xyz/" target="_blank" rel="noreferrer" className="hover:text-[#4ECDC4]">Docs</a></div>
              </div>
            </div>
            <div>
              <h4 className="mb-4 text-xl font-black">BUILT WITH</h4>
              <div className="space-y-2 font-bold text-white/80">
                <div>• MetaMask DTK</div>
                <div>• Monad Testnet</div>
                <div>• Next.js + Wagmi</div>
                <div>• ADK AI Agents</div>
              </div>
            </div>
          </div>
          <div className="mt-8 border-t-4 border-white/20 pt-8 text-center font-bold text-white/60">
            © 2025 DCA SITTER. ALL RIGHTS RESERVED.
          </div>
        </div>
      </footer>
    </div>
  );
}
