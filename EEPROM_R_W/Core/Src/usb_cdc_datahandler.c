#include "usb_cdc_datahandler.h"
#include "main.h"
#include "usb_device.h"
#include "stdlib.h"
#include <stdio.h>
#include "usbd_cdc_if.h"


uint8_t buffer[0x400];

int16_t bufferIndex;

uint8_t sofChar = 0x77;
uint8_t dleChar = 0x88;
uint8_t eofChar = 0x99;

uint8_t lastByteWasDle = 0;

uint16_t eepromBusAddress;
uint16_t eerpomAddressSize;
uint16_t eerpomWriteBufferSize;
uint32_t eepromWriteDelay;

volatile   uint8_t commandReady = 0 ;

static void CmdRead(uint16_t address, uint16_t len);
static void CmdWrite(uint16_t address, uint8_t *pData, uint16_t len);

void HandleCommand()
{
	if (commandReady== 0 )
		return ;
	commandReady= 0;

	switch (buffer[0])
	{
	case 'W':
	{
		uint32_t address = *(uint32_t *)&buffer[1];
		uint32_t len = *(uint32_t *)&buffer[5];

		CmdWrite(address, &buffer[9], len);
		break;
	}

	case 'R':
	{
		uint32_t address = *(uint32_t *)&buffer[1];
		uint32_t len = *(uint32_t *)&buffer[5];

		CmdRead(address, len);
		break;
	}
	case 'S':
	{
		uint32_t eepromSpeed = *(uint32_t *)&buffer[1];
		if (HAL_I2C_DeInit(&hi2c1) != HAL_OK)
		{
			CDC_Transmit_FS( (uint8_t*)0x02, 1);
		}
		hi2c1.Init.ClockSpeed = eepromSpeed;
		if (HAL_I2C_Init(&hi2c1) != HAL_OK)
		{
			CDC_Transmit_FS((uint8_t*)0x02, 1);
		}

		eepromBusAddress = buffer[5];
		eerpomAddressSize = *(uint16_t *)&buffer[6];
		eerpomWriteBufferSize = *(uint16_t *)&buffer[8];
		eepromWriteDelay = *(uint32_t *)&buffer[10];
		CDC_Transmit_FS((uint8_t*)0x00, 1);
		break;
	}
	default:
	{
		CDC_Transmit_FS((uint8_t*)0xff, 1);
	}
	}
	bufferIndex = 0 ;
}

void My_USB_Receive_Handler(uint8_t *Buf, uint16_t Len)
{
	for (int i = 0; Len > i; i++)
	{
		if (lastByteWasDle == 1)
		{
			lastByteWasDle = 0;
		}
		else if (Buf[i] == sofChar)
		{
			commandReady = 0 ;
			bufferIndex = 0;
			continue;
		}
		else if (Buf[i] == dleChar)
		{
			lastByteWasDle = 1;
			continue;
		}
		else if (Buf[i] == eofChar)
		{
			// HandleCommand();
			commandReady = 1 ;
			//bufferIndex = 0;
			continue;
		}
		buffer[bufferIndex++] = Buf[i];
	}
}

static void CmdRead(uint16_t address, uint16_t len)
{
	HAL_StatusTypeDef result;
	result = HAL_I2C_Mem_Read(&hi2c1, eepromBusAddress, address, eerpomAddressSize, &buffer[1], len, 1000);
	buffer[0] = result;

	if (result == 0 ){
		 CDC_Transmit_FS(&buffer[0], len + 1);
	}
	else
	{
		CDC_Transmit_FS(&buffer[0], 1);
	}
}

static void CmdWrite(uint16_t address, uint8_t *pData, uint16_t len)
{
	HAL_StatusTypeDef result;
	int dataToWrite = eerpomWriteBufferSize;

	int pageOffset = address % eerpomWriteBufferSize;
	dataToWrite =eerpomWriteBufferSize - pageOffset;

	for (int i = 0; i < len; i += dataToWrite)
	{
		dataToWrite =eerpomWriteBufferSize -pageOffset;
		pageOffset = 0 ;

		if (len - i < dataToWrite )
			dataToWrite = len - i ;

		result = HAL_I2C_Mem_Write(&hi2c1, eepromBusAddress, address+i, eerpomAddressSize, &pData[i], dataToWrite, 1000);

		HAL_Delay(eepromWriteDelay);
		if (result != 0)
			break;
	}

	buffer[0] = result;
	CDC_Transmit_FS(&buffer[0], 1);
}
