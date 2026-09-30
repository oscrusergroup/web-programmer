export function BoardArt() {
  return (
    <svg
      viewBox="0 0 340 166"
      role="img"
      aria-label="Illustration of an Arduino Mega 2560"
      className="w-full max-w-[320px] drop-shadow-lg"
    >
      <defs>
        <linearGradient id="pcb" x2="1" y2="1">
          <stop stopColor="#287a9b" />
          <stop offset="1" stopColor="#205573" />
        </linearGradient>
      </defs>
      <g transform="translate(35 15) rotate(-5 130 70)">
        <path
          d="M12 0H252L268 15V121L257 134H9L0 123V12Z"
          fill="url(#pcb)"
          stroke="#173f57"
          strokeWidth="2"
        />
        {[12, 252].flatMap((x) =>
          [12, 121].map((y) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r="5"
              fill="#d4dfe3"
              stroke="#153e56"
              strokeWidth="3"
            />
          )),
        )}
        <path
          d="M44 42H98V65H150M54 100H92V79H142M168 34H216V91H189M104 110H205"
          fill="none"
          stroke="#75b5c9"
          opacity=".45"
          strokeWidth="1"
        />
        <rect
          x="-13"
          y="26"
          width="43"
          height="35"
          rx="3"
          fill="#dbe3ea"
          stroke="#92a3b7"
          strokeWidth="2"
        />
        <rect x="-13" y="33" width="10" height="21" fill="#8b9cae" />
        <rect x="-10" y="37" width="7" height="13" fill="#37455a" />
        <rect x="-8" y="91" width="37" height="26" rx="4" fill="#15283a" />
        <ellipse cx="-7" cy="104" rx="5" ry="11" fill="#0b1825" />
        <rect
          x="111"
          y="44"
          width="45"
          height="45"
          rx="2"
          fill="#183044"
          stroke="#90a9b1"
        />
        {Array.from({ length: 10 }, (_, i) => (
          <g key={i} stroke="#b1c2c8" strokeWidth="2">
            <path
              d={`M${114 + i * 4} 39v5m0 45v5M106 ${47 + i * 4}h5m45 0h5`}
            />
          </g>
        ))}
        <text
          x="134"
          y="66"
          textAnchor="middle"
          fill="#9eb2c0"
          fontSize="5"
          fontFamily="monospace"
        >
          ATMEGA
        </text>
        <text
          x="134"
          y="75"
          textAnchor="middle"
          fill="#9eb2c0"
          fontSize="6"
          fontFamily="monospace"
        >
          2560
        </text>
        <text
          x="179"
          y="64"
          fill="#e0f3f5"
          fontSize="12"
          fontWeight="600"
          fontFamily="sans-serif"
        >
          MEGA
        </text>
        <text x="179" y="77" fill="#b5d4df" fontSize="7" letterSpacing="2">
          2560
        </text>
        {[31, 91, 159, 216].map((x, idx) => (
          <g key={x}>
            <rect
              x={x}
              y="5"
              width={idx === 3 ? 23 : 49}
              height="10"
              rx="1"
              fill="#152b3b"
            />
            {Array.from({ length: idx === 3 ? 4 : 8 }, (_, i) => (
              <rect
                key={i}
                x={x + 4 + i * 5.6}
                y="8"
                width="2.4"
                height="3"
                fill="#9b9d7d"
              />
            ))}
          </g>
        ))}
        {[53, 116, 181].map((x) => (
          <g key={x}>
            <rect x={x} y="117" width="53" height="10" rx="1" fill="#152b3b" />
            {Array.from({ length: 8 }, (_, i) => (
              <rect
                key={i}
                x={x + 4 + i * 6}
                y="120"
                width="2.4"
                height="3"
                fill="#9b9d7d"
              />
            ))}
          </g>
        ))}
        <rect x="247" y="31" width="12" height="75" fill="#152b3b" />
        {Array.from({ length: 12 }, (_, i) => (
          <g key={i} fill="#9b9d7d">
            <rect x="250" y={34 + i * 6} width="2" height="2" />
            <rect x="254" y={34 + i * 6} width="2" height="2" />
          </g>
        ))}
        <rect x="44" y="34" width="13" height="13" fill="#a9b5bf" rx="2" />
        <circle cx="50.5" cy="40.5" r="4" fill="#495a6b" />
        <rect x="61" y="65" width="15" height="20" fill="#173145" />
        <rect x="83" y="44" width="6" height="12" rx="3" fill="#c5c8c0" />
        <circle cx="44" cy="88" r="3" fill="#7ee2b5" />
        <text x="39" y="101" fill="#bdd6e0" fontSize="5">
          ON
        </text>
        <text x="56" y="26" fill="#a1c3d1" fontSize="5" letterSpacing="1.5">
          DIGITAL I/O
        </text>
        <text x="170" y="109" fill="#a1c3d1" fontSize="5" letterSpacing="1.5">
          ANALOG IN
        </text>
      </g>
    </svg>
  );
}
