package com.groupware.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;

import com.groupware.dto.DepartmentDTO;

@Mapper
public interface DepartmentMapper {

	// 관리자: 신규 등록/수정 모달의 부서 드롭다운용 전체 목록
	List<DepartmentDTO> findAll();
}
