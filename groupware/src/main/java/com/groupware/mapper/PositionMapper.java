package com.groupware.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;

import com.groupware.dto.PositionDTO;

@Mapper
public interface PositionMapper {

	// 관리자: 신규 등록/수정 모달의 직급 드롭다운용 전체 목록
	List<PositionDTO> findAll();
}
