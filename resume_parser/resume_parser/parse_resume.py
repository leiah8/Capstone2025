from __future__ import annotations

import argparse
import json
from typing import Any, Dict

from .structured_parser import ResumeParser


def parse_resume(file_path: str) -> Dict[str, Any]:
    parser = ResumeParser.from_env()
    return parser.parse_local_file(file_path)


def parse_resume_url(file_url: str) -> Dict[str, Any]:
    parser = ResumeParser.from_env()
    return parser.parse_remote_file(file_url)


def main() -> None:
    arg_parser = argparse.ArgumentParser(
        description="Parse a resume into structured profile JSON via OpenAI."
    )
    arg_parser.add_argument(
        "--file",
        help="Path to a local resume file (.pdf, .doc, .docx, etc.)",
    )
    arg_parser.add_argument(
        "--url",
        help="Remote resume URL to parse directly with OpenAI.",
    )
    arg_parser.add_argument(
        "--json",
        dest="json_out",
        default=None,
        help="Optional path to write JSON output.",
    )
    args = arg_parser.parse_args()

    if bool(args.file) == bool(args.url):
        raise SystemExit("Provide exactly one of --file or --url.")

    out = parse_resume(args.file) if args.file else parse_resume_url(args.url)

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as handle:
            json.dump(out, handle, ensure_ascii=False, indent=2)
    else:
        print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
