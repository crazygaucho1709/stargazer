import { Grid, Button, Icon } from "@chakra-ui/react";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";

export const JogPad = ({ onJog }: { onJog: (dir: string) => void }) => {
  const btn = (dir: string, icon: JSX.Element) => (
    <Button
      size="xs" w="28px" h="28px" p={0}
      bg="rgba(255,255,255,0.06)" _hover={{ bg: 'rgba(255,255,255,0.12)' }}
      borderRadius="5px" border="1px solid rgba(255,255,255,0.08)"
      onClick={() => onJog(dir)}
    >
      {icon}
    </Button>
  );
  return (
    <Grid templateColumns="repeat(3, 28px)" templateRows="repeat(3, 28px)" gap="2px">
      <Box />
      {btn('up', <Icon as={ArrowUp} boxSize={3} color="whiteAlpha.700" />)}
      <Box />
      {btn('left', <Icon as={ArrowLeft} boxSize={3} color="whiteAlpha.700" />)}
      <Box bg="rgba(255,255,255,0.03)" borderRadius="4px" />
      {btn('right', <Icon as={ArrowRight} boxSize={3} color="whiteAlpha.700" />)}
      <Box />
      {btn('down', <Icon as={ArrowDown} boxSize={3} color="whiteAlpha.700" />)}
      <Box />
    </Grid>
  );
};
