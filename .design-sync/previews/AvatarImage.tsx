import { Avatar, AvatarFallback, AvatarImage } from "myra-agents";

const AGENT_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' fill='%234f46e5'/><text x='40' y='52' font-size='36' fill='white' text-anchor='middle' font-family='sans-serif'>MA</text></svg>";

export function WithImage() {
  return (
    <Avatar size="lg">
      <AvatarImage src={AGENT_IMG} alt="Myra agent" />
      <AvatarFallback>MA</AvatarFallback>
    </Avatar>
  );
}
