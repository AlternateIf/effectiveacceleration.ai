import { MARKETPLACE_DATA_VIEW_V1_ABI } from "effectiveacceleration-contracts/wagmi/MarketplaceDataViewV1";
import Config from "effectiveacceleration-contracts/scripts/config.json";
import { useState, useEffect, useMemo } from "react";
import { useAccount, useBlockNumber, useReadContract } from "wagmi";

export default function useArbitratorsLength() {
  const [arbitratorsLength, setArbitratorsLength] = useState<bigint>(0n);
  const { address } = useAccount();
  const blockNumber = useBlockNumber();

  const result = useReadContract({
    account:      address,
    abi:          MARKETPLACE_DATA_VIEW_V1_ABI,
    address:      Config.marketplaceDataViewAddress as `0x${string}`,
    functionName: 'arbitratorsLength',
    args:         [],
  });

  const arbitratorsLengthData = result.data as bigint;
  const { data: _, ...rest } = result;

  useEffect(() => {
    if (arbitratorsLengthData !== null) {
      setArbitratorsLength(arbitratorsLengthData);
    }
  }, [arbitratorsLengthData]);

  return useMemo(() => ({ data: arbitratorsLength, ...rest }), [blockNumber, arbitratorsLength]);
}